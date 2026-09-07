import { mkdtemp, rm, writeFile } from 'node:fs/promises';
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
