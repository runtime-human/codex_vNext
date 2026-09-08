import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runDoctor, runDoctorFromEnvironment } from '../../src/doctor/index.js';
import {
  migrateDatabase,
  openWorkflowDatabase,
  resolveStorageRoot,
  StateRepositories,
  type StorageRoot,
} from '../../src/state/index.js';

const at = '2026-09-08T00:00:00Z';
let pluginData: string;
let storage: StorageRoot;
let db: DatabaseSync;
let repositories: StateRepositories;

beforeEach(async () => {
  pluginData = await mkdtemp(path.join(tmpdir(), 'workflow-next-doctor-'));
  storage = resolveStorageRoot(pluginData);
  db = openWorkflowDatabase(storage);
  await migrateDatabase(db, storage);
  repositories = new StateRepositories(db);
});

afterEach(async () => {
  if (db.isOpen) db.close();
  await rm(pluginData, { recursive: true });
});

describe('read-only doctor', () => {
  it('passes a healthy empty state store', () => {
    expect(runDoctor({ storage, db, repositories })).toMatchObject({
      status: 'pass',
    });
  });

  it('fails checksum drift and foreign-key violations', () => {
    db.prepare(
      "UPDATE schema_migrations SET checksum = 'bad' WHERE version = 1",
    ).run();
    db.exec('PRAGMA foreign_keys = OFF');
    db.exec(`INSERT INTO runs (
      run_id, project_id, objective, state, durable, started_at, updated_at, version
    ) VALUES ('run-bad', 'missing', 'bad', 'active', 0, '${at}', '${at}', 1)`);
    db.exec('PRAGMA foreign_keys = ON');

    const report = runDoctor({ storage, db, repositories });
    expect(report.status).toBe('fail');
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'migration_checksum', status: 'fail' }),
        expect.objectContaining({ name: 'foreign_key_check', status: 'fail' }),
      ]),
    );
  });

  it('fails missing referenced artifacts', () => {
    repositories.putArtifact({
      artifactId: 'artifact-missing',
      sha256: 'a'.repeat(64),
      byteSize: 1,
      mediaType: 'text/plain',
      relativePath: `artifacts/sha256/aa/${'a'.repeat(64)}`,
      createdAt: at,
    });
    const report = runDoctor({ storage, db, repositories });
    expect(report.status).toBe('fail');
    expect(report.checks).toContainEqual(
      expect.objectContaining({ name: 'artifact_targets', status: 'fail' }),
    );
  });

  it('fails referenced artifacts whose bytes do not match metadata', async () => {
    const hash = 'a'.repeat(64);
    const relativePath = `artifacts/sha256/aa/${hash}`;
    const absolutePath = path.join(storage.root, relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, 'corrupt');
    repositories.putArtifact({
      artifactId: 'artifact-corrupt',
      sha256: hash,
      byteSize: 1,
      mediaType: 'text/plain',
      relativePath,
      createdAt: at,
    });

    const report = runDoctor({ storage, db, repositories });
    expect(report.status).toBe('fail');
    expect(report.checks).toContainEqual(
      expect.objectContaining({ name: 'artifact_targets', status: 'fail' }),
    );
  });

  it('warns for orphan CAS and cleanup-required resources without deleting them', async () => {
    repositories.putProject({
      projectId: 'project-1',
      repoRoot: '/repo',
      repoKey: 'key',
      repoFingerprint: 'fingerprint',
      createdAt: at,
      updatedAt: at,
      version: 1,
    });
    repositories.putRun({
      runId: 'run-1',
      projectId: 'project-1',
      objective: 'doctor',
      state: 'active',
      durable: false,
      startedAt: at,
      updatedAt: at,
      version: 1,
    });
    repositories.putResource({
      resourceId: 'resource-1',
      runId: 'run-1',
      type: 'worktree',
      control: 'coordinated',
      owner: 'main',
      nativeRef: 'worktree-1',
      status: 'completed',
      cleanupRequired: true,
      version: 1,
      createdAt: at,
      updatedAt: at,
    });
    const hash = 'f'.repeat(64);
    const orphan = path.join(storage.artifactSha256Dir, 'ff', hash);
    await mkdir(path.dirname(orphan), { recursive: true });
    await writeFile(orphan, 'orphan');

    const report = runDoctor({ storage, db, repositories });
    expect(report.status).toBe('warn');
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'orphan_cas', status: 'warn' }),
        expect.objectContaining({ name: 'cleanup_required', status: 'warn' }),
      ]),
    );
    expect(await writeFile(orphan, 'still present')).toBeUndefined();
  });

  it('rejects a child storage path that resolves outside PLUGIN_DATA', async () => {
    const outside = await mkdtemp(
      path.join(tmpdir(), 'workflow-next-doctor-outside-'),
    );
    const outsideStorage = resolveStorageRoot(outside);
    const outsideDb = openWorkflowDatabase(outsideStorage);
    await migrateDatabase(outsideDb, outsideStorage);
    db.close();
    await rm(path.join(pluginData, 'state'), { recursive: true });
    const linked = await symlink(
      outsideStorage.stateDir,
      path.join(pluginData, 'state'),
      process.platform === 'win32' ? 'junction' : 'dir',
    ).then(
      () => true,
      (error: NodeJS.ErrnoException) => {
        if (error.code === 'EPERM') return false;
        throw error;
      },
    );
    if (!linked) {
      outsideDb.close();
      await rm(outside, { recursive: true });
      return;
    }

    const previous = process.env.PLUGIN_DATA;
    process.env.PLUGIN_DATA = pluginData;
    try {
      expect(runDoctorFromEnvironment()).toEqual({
        status: 'fail',
        checks: [
          {
            name: 'plugin_data',
            status: 'fail',
            message: 'PLUGIN_DATA layout is unavailable',
          },
        ],
      });
    } finally {
      if (previous === undefined) delete process.env.PLUGIN_DATA;
      else process.env.PLUGIN_DATA = previous;
      outsideDb.close();
      await rm(outside, { recursive: true });
    }
  });
});
