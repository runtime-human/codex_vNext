import { createHash } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  truncate,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ArtifactStore,
  artifactFileMatches,
  migrateDatabase,
  openWorkflowDatabase,
  resolveStorageRoot,
  StateRepositories,
  type StorageRoot,
} from '../../src/state/index.js';

let pluginData: string;
let storage: StorageRoot;
let db: DatabaseSync;
let store: ArtifactStore;

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

beforeEach(async () => {
  pluginData = await mkdtemp(path.join(tmpdir(), 'workflow-next-artifact-'));
  storage = resolveStorageRoot(pluginData);
  db = openWorkflowDatabase(storage);
  await migrateDatabase(db, storage);
  store = new ArtifactStore({
    storage,
    repositories: new StateRepositories(db),
    clock: { nowIso: () => '2026-09-08T00:00:00Z' },
  });
});

afterEach(async () => {
  if (db.isOpen) db.close();
  await rm(pluginData, { recursive: true });
});

describe('ArtifactStore', () => {
  it('deduplicates bytes into a bounded in-root CAS and round-trips metadata', async () => {
    const bytes = new TextEncoder().encode('artifact');
    const first = store.putBytes({
      bytes,
      mediaType: 'text/plain',
      preview: 'artifact',
    });
    const second = store.putBytes({ bytes, mediaType: 'text/plain' });
    const resolved = store.resolvePath(first.artifactId);

    expect(second).toEqual(first);
    expect(store.get(first.artifactId)).toEqual(first);
    expect(first.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(first.relativePath).toBe(
      `artifacts/sha256/${first.sha256.slice(0, 2)}/${first.sha256}`,
    );
    expect(path.relative(storage.root, resolved)).not.toMatch(
      /^\.\.(?:[\\/]|$)/,
    );
    expect(await readFile(resolved)).toEqual(Buffer.from(bytes));
  });

  it('enforces the 10 MiB ceiling', () => {
    expect(() =>
      store.putBytes({
        bytes: new Uint8Array(10 * 1024 * 1024 + 1),
        mediaType: 'application/octet-stream',
      }),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_ARGUMENT' }));
  });

  it('rejects a corrupt existing CAS object instead of trusting its path', async () => {
    const bytes = new TextEncoder().encode('artifact');
    const artifact = store.putBytes({ bytes, mediaType: 'text/plain' });
    await writeFile(store.resolvePath(artifact.artifactId), 'corrupt');

    expect(() =>
      store.putBytes({ bytes, mediaType: 'text/plain' }),
    ).toThrowError(expect.objectContaining({ code: 'INTEGRITY_FAILED' }));
  });

  it('rejects oversized CAS targets before hashing them', async () => {
    const target = path.join(pluginData, 'oversized');
    await writeFile(target, '');
    await truncate(target, 10 * 1024 * 1024 + 1);

    expect(
      artifactFileMatches(
        {
          sha256:
            '0c2725e0d4ae4ae669bdd6c88b253997198efb67d962d217c52e6cbfd318fe0c',
          byteSize: 10 * 1024 * 1024 + 1,
        },
        target,
      ),
    ).toBe(false);
  });

  it('rejects a reparse point in an existing CAS directory component', async () => {
    const bytes = new TextEncoder().encode('cas reparse');
    const hash = createHash('sha256').update(bytes).digest('hex');
    const outside = await mkdtemp(
      path.join(tmpdir(), 'workflow-next-cas-outside-'),
    );
    const prefix = path.join(storage.artifactSha256Dir, hash.slice(0, 2));
    const linked = await linkDirectory(outside, prefix);
    if (!linked) return;

    expect(() =>
      store.putBytes({ bytes, mediaType: 'text/plain' }),
    ).toThrowError(expect.objectContaining({ code: 'PATH_OUTSIDE_ROOT' }));
    await rm(outside, { recursive: true });
  });

  it('rejects a reparse point used as an existing CAS target', async () => {
    const bytes = new TextEncoder().encode('cas target reparse');
    const hash = createHash('sha256').update(bytes).digest('hex');
    const outside = await mkdtemp(
      path.join(tmpdir(), 'workflow-next-cas-outside-'),
    );
    const target = path.join(outside, 'target');
    const linkType = process.platform === 'win32' ? 'junction' : 'file';
    if (linkType === 'file') await writeFile(target, bytes);
    else await mkdir(target);
    const destination = path.join(
      storage.artifactSha256Dir,
      hash.slice(0, 2),
      hash,
    );
    await mkdir(path.dirname(destination), { recursive: true });
    const linked = await symlink(target, destination, linkType).then(
      () => true,
      (error: NodeJS.ErrnoException) => {
        if (error.code === 'EPERM') return false;
        throw error;
      },
    );
    if (!linked) return;

    expect(() =>
      store.putBytes({ bytes, mediaType: 'text/plain' }),
    ).toThrowError(expect.objectContaining({ code: 'PATH_OUTSIDE_ROOT' }));
    await rm(outside, { recursive: true });
  });

  it('preserves an existing regular CAS target', async () => {
    const bytes = new TextEncoder().encode('existing cas');
    const hash = createHash('sha256').update(bytes).digest('hex');
    const destination = path.join(
      storage.artifactSha256Dir,
      hash.slice(0, 2),
      hash,
    );
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, bytes);

    const artifact = store.putBytes({ bytes, mediaType: 'text/plain' });
    expect(await readFile(destination)).toEqual(Buffer.from(bytes));
    expect(artifact.relativePath).toBe(
      `artifacts/sha256/${hash.slice(0, 2)}/${hash}`,
    );
  });

  it('detects an unreferenced CAS object without deleting it', async () => {
    const hash = 'f'.repeat(64);
    const directory = path.join(storage.artifactSha256Dir, 'ff');
    await mkdir(directory, { recursive: true });
    const orphan = path.join(directory, hash);
    await writeFile(orphan, 'orphan');

    expect(store.listOrphans()).toEqual([`artifacts/sha256/ff/${hash}`]);
    expect(store.listOrphans()).toHaveLength(1);
  });
});
