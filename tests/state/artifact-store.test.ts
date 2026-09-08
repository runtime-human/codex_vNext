import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
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
