import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import {
  openWorkflowDatabase,
  resolveStorageRoot,
  StateError,
  withImmediateTransaction,
} from '../../src/state/index.js';

const tempRoots: string[] = [];

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'workflow-next-'));
  tempRoots.push(root);
  return root;
}

function expectStorageUnavailable(action: () => unknown): void {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(StateError);
    expect((error as StateError).code).toBe('STORAGE_UNAVAILABLE');
    return;
  }
  throw new Error('expected STORAGE_UNAVAILABLE');
}

async function linkDirectory(target: string, link: string): Promise<boolean> {
  try {
    await symlink(
      target,
      link,
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EPERM') return false;
    throw error;
  }
}

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true })),
  );
});

describe('PH-02 SQLite foundation', () => {
  it('fails closed when PLUGIN_DATA is unavailable', () => {
    expectStorageUnavailable(() => resolveStorageRoot(undefined));
  });

  it('rejects a file as PLUGIN_DATA', async () => {
    const root = await tempRoot();
    const file = path.join(root, 'not-a-directory');
    await writeFile(file, 'x');

    expectStorageUnavailable(() => resolveStorageRoot(file));
  });

  it('creates every storage path inside PLUGIN_DATA', async () => {
    const pluginData = await tempRoot();
    const storage = resolveStorageRoot(pluginData);

    expect(storage.root).toBe(path.resolve(pluginData));
    for (const candidate of [
      storage.stateDir,
      storage.artifactsDir,
      storage.backupsDir,
      storage.tmpDir,
      storage.databasePath,
    ]) {
      expect(path.relative(storage.root, candidate)).not.toMatch(
        /^\.\.(?:[\\/]|$)/,
      );
    }
  });

  it('rejects reparse points in existing storage directories', async () => {
    const pluginData = await tempRoot();
    const target = path.join(pluginData, 'state-target');
    await mkdir(target);
    const linked = await linkDirectory(target, path.join(pluginData, 'state'));
    if (!linked) return;

    expect(() => resolveStorageRoot(pluginData)).toThrow(
      expect.objectContaining({ code: 'PATH_OUTSIDE_ROOT' }),
    );
  });

  it('rejects a reparse point used as PLUGIN_DATA itself', async () => {
    const parent = await tempRoot();
    const target = await tempRoot();
    const pluginData = path.join(parent, 'plugin-data');
    const linked = await linkDirectory(target, pluginData);
    if (!linked) return;

    expect(() => resolveStorageRoot(pluginData)).toThrow(
      expect.objectContaining({ code: 'PATH_OUTSIDE_ROOT' }),
    );
  });

  it('rejects a reparse point in the PLUGIN_DATA ancestor chain before mkdir', async () => {
    const parent = await tempRoot();
    const target = await tempRoot();
    const linkedParent = path.join(parent, 'linked-parent');
    const linked = await linkDirectory(target, linkedParent);
    if (!linked) return;

    const pluginData = path.join(linkedParent, 'plugin-data');
    expect(() => resolveStorageRoot(pluginData)).toThrow(
      expect.objectContaining({ code: 'PATH_OUTSIDE_ROOT' }),
    );
    expect(existsSync(path.join(target, 'plugin-data'))).toBe(false);
  });

  it('rejects a reparse point used as the existing database target', async () => {
    const pluginData = await tempRoot();
    const storage = resolveStorageRoot(pluginData);
    const target = path.join(pluginData, 'database-target');
    const linkType = process.platform === 'win32' ? 'junction' : 'file';
    if (linkType === 'file') await writeFile(target, 'not sqlite');
    else await mkdir(target);
    await rm(storage.databasePath, { force: true });
    const linked = await symlink(target, storage.databasePath, linkType).then(
      () => true,
      (error: NodeJS.ErrnoException) => {
        if (error.code === 'EPERM') return false;
        throw error;
      },
    );
    if (!linked) return;

    expect(() => resolveStorageRoot(pluginData)).toThrow(
      expect.objectContaining({ code: 'PATH_OUTSIDE_ROOT' }),
    );
  });

  it.each(['-wal', '-shm'])(
    'rejects a reparse point used as the SQLite %s sidecar before WAL activation',
    async (suffix) => {
      const pluginData = await tempRoot();
      const storage = resolveStorageRoot(pluginData);
      const initial = openWorkflowDatabase(storage);
      initial.close();

      const target = await tempRoot();
      const sidecar = `${storage.databasePath}${suffix}`;
      const linked = await symlink(
        target,
        sidecar,
        process.platform === 'win32' ? 'junction' : 'file',
      ).then(
        () => true,
        (error: NodeJS.ErrnoException) => {
          if (error.code === 'EPERM') return false;
          throw error;
        },
      );
      if (!linked) return;

      expect(() => openWorkflowDatabase(storage)).toThrow(
        expect.objectContaining({ code: 'PATH_OUTSIDE_ROOT' }),
      );
    },
  );

  it('preserves an existing regular database file', async () => {
    const pluginData = await tempRoot();
    const storage = resolveStorageRoot(pluginData);
    await writeFile(storage.databasePath, 'existing database');

    expect(resolveStorageRoot(pluginData).databasePath).toBe(
      storage.databasePath,
    );
  });

  it('opens SQLite with the required safety pragmas', async () => {
    const db = openWorkflowDatabase(resolveStorageRoot(await tempRoot()));
    try {
      expect(db.prepare('PRAGMA foreign_keys').get()).toEqual({
        foreign_keys: 1,
      });
      expect(db.prepare('PRAGMA journal_mode').get()).toEqual({
        journal_mode: 'wal',
      });
      expect(db.prepare('PRAGMA synchronous').get()).toEqual({
        synchronous: 2,
      });
      expect(db.prepare('PRAGMA quick_check').get()).toEqual({
        quick_check: 'ok',
      });
      expect(() => db.enableLoadExtension(true)).toThrow();
    } finally {
      db.close();
    }
  });

  it('rolls back a failed immediate transaction', async () => {
    const db = openWorkflowDatabase(resolveStorageRoot(await tempRoot()));
    db.exec('CREATE TABLE sample (value TEXT) STRICT');
    const sentinel = new Error('sentinel');

    try {
      expect(() =>
        withImmediateTransaction(db, () => {
          db.prepare('INSERT INTO sample (value) VALUES (?)').run('discarded');
          throw sentinel;
        }),
      ).toThrow(sentinel);
      expect(db.prepare('SELECT count(*) AS count FROM sample').get()).toEqual({
        count: 0,
      });
    } finally {
      db.close();
    }
  });

  it('rejects async transaction callbacks and rolls them back', async () => {
    const db = openWorkflowDatabase(resolveStorageRoot(await tempRoot()));
    db.exec('CREATE TABLE sample (value TEXT) STRICT');

    try {
      expect(() =>
        withImmediateTransaction(db, () => {
          db.prepare('INSERT INTO sample (value) VALUES (?)').run('discarded');
          return Promise.resolve('not allowed');
        }),
      ).toThrow('write transaction callback must be synchronous');
      expect(db.prepare('SELECT count(*) AS count FROM sample').get()).toEqual({
        count: 0,
      });
    } finally {
      db.close();
    }
  });
});
