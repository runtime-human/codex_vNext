import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runDoctor } from '../../src/doctor/index.js';
import {
  migrateDatabase,
  openWorkflowDatabase,
  resolveStorageRoot,
  StateRepositories,
  type StorageRoot,
} from '../../src/state/index.js';

let pluginData: string;
let storage: StorageRoot;
let db: DatabaseSync;
let repositories: StateRepositories;

beforeEach(async () => {
  pluginData = await mkdtemp(path.join(tmpdir(), 'workflow-next-ph03-doctor-'));
  storage = resolveStorageRoot(pluginData);
  db = openWorkflowDatabase(storage);
  await migrateDatabase(db, storage);
  repositories = new StateRepositories(db);
});

afterEach(async () => {
  if (db.isOpen) db.close();
  await rm(pluginData, { recursive: true, force: true });
});

describe('PH-03 context doctor integrity', () => {
  it('reports the migrated context schema, strictness, foreign keys and indexes as healthy', () => {
    const report = runDoctor({ storage, db, repositories });

    expect(report.status).toBe('pass');
    expect(report.checks).toContainEqual({
      name: 'context_schema',
      status: 'pass',
      message: 'context schema and indexes are valid',
    });
  });

  it('fails when a required context index is missing even though migration metadata is unchanged', () => {
    db.exec('DROP INDEX idx_context_project_source');

    const report = runDoctor({ storage, db, repositories });

    expect(report.status).toBe('fail');
    expect(report.checks).toContainEqual({
      name: 'context_schema',
      status: 'fail',
      message: 'context schema or indexes are invalid',
    });
    expect(report.checks).toContainEqual(
      expect.objectContaining({ name: 'migration_checksum', status: 'pass' }),
    );
    expect(report.checks).toContainEqual(
      expect.objectContaining({ name: 'quick_check', status: 'pass' }),
    );
  });
});
