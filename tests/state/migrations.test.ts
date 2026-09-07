import { execFile } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';
import {
  currentSchemaVersion,
  INITIAL_MIGRATION,
  type Migration,
  migrateDatabase,
  openWorkflowDatabase,
  resolveStorageRoot,
  StateError,
} from '../../src/state/index.js';

const execFileAsync = promisify(execFile);
const tempRoots: string[] = [];

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'workflow-next-migration-'));
  tempRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true })),
  );
});

describe('PH-02 migrations', () => {
  it('applies migration 001 exactly once to an empty database', async () => {
    const storage = resolveStorageRoot(await tempRoot());
    const db = openWorkflowDatabase(storage);
    try {
      await migrateDatabase(db, storage);
      await migrateDatabase(db, storage);

      expect(currentSchemaVersion(db)).toBe(1);
      expect(
        db.prepare('SELECT count(*) AS count FROM schema_migrations').get(),
      ).toEqual({
        count: 1,
      });
      const tables = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
        )
        .all()
        .map((row) => (row as { name: string }).name);
      expect(tables).toEqual([
        'artifacts',
        'command_receipts',
        'decisions',
        'evidence',
        'projects',
        'resources',
        'runs',
        'schema_migrations',
        'sqlite_sequence',
        'work_items',
        'workflow_events',
      ]);
    } finally {
      db.close();
    }
  });

  it('rejects checksum drift', async () => {
    const storage = resolveStorageRoot(await tempRoot());
    const db = openWorkflowDatabase(storage);
    try {
      await migrateDatabase(db, storage);
      const drifted = {
        ...INITIAL_MIGRATION,
        sql: `${INITIAL_MIGRATION.sql}\n-- drift`,
      };
      await expect(
        migrateDatabase(db, storage, [drifted]),
      ).rejects.toMatchObject({
        code: 'MIGRATION_CONFLICT',
      });
    } finally {
      db.close();
    }
  });

  it('rolls back a failed migration completely', async () => {
    const storage = resolveStorageRoot(await tempRoot());
    const db = openWorkflowDatabase(storage);
    const failed: Migration = {
      version: 1,
      name: 'failed',
      sql: 'CREATE TABLE partial (id INTEGER) STRICT; INSERT INTO missing VALUES (1);',
    };
    try {
      await expect(migrateDatabase(db, storage, [failed])).rejects.toThrow();
      expect(
        db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all(),
      ).toEqual([]);
    } finally {
      db.close();
    }
  });

  it('serializes two independent migrator processes', async () => {
    const pluginData = await tempRoot();
    const initialConnection = openWorkflowDatabase(
      resolveStorageRoot(pluginData),
    );
    initialConnection.close();
    const worker = path.resolve('tests/fixtures/migration-worker.test.ts');
    const vitest = path.resolve('node_modules/vitest/vitest.mjs');
    const runWorker = () =>
      execFileAsync(process.execPath, [vitest, 'run', worker], {
        cwd: process.cwd(),
        env: { ...process.env, MIGRATION_WORKER_ROOT: pluginData },
        timeout: 30_000,
      });

    await Promise.all([runWorker(), runWorker()]);

    const storage = resolveStorageRoot(pluginData);
    const db = openWorkflowDatabase(storage);
    try {
      expect(
        db.prepare('SELECT count(*) AS count FROM schema_migrations').get(),
      ).toEqual({
        count: 1,
      });
    } finally {
      db.close();
    }
  });

  it('backs up before an incompatible migration attempt', async () => {
    const storage = resolveStorageRoot(await tempRoot());
    const db = openWorkflowDatabase(storage);
    const incompatible: Migration = {
      version: 2,
      name: 'incompatible-test-only',
      incompatible: true,
      sql: 'INSERT INTO missing VALUES (1);',
    };
    try {
      await migrateDatabase(db, storage);
      await expect(
        migrateDatabase(db, storage, [INITIAL_MIGRATION, incompatible]),
      ).rejects.toThrow();
      expect(
        (await readdir(storage.backupsDir)).filter((name) =>
          name.endsWith('.sqlite3'),
        ),
      ).toHaveLength(1);
      expect(currentSchemaVersion(db)).toBe(1);
    } finally {
      db.close();
    }
  });

  it('classifies failed integrity checks deterministically', async () => {
    const storage = resolveStorageRoot(await tempRoot());
    const corruptor = new DatabaseSync(storage.databasePath, {
      defensive: false,
    });
    corruptor.enableDefensive(false);
    corruptor.exec(`
      CREATE TABLE sample (id INTEGER);
      PRAGMA writable_schema = ON;
      UPDATE sqlite_schema SET rootpage = 999999 WHERE name = 'sample';
      PRAGMA writable_schema = OFF;
    `);
    corruptor.close();

    const db = new DatabaseSync(storage.databasePath);
    try {
      await expect(migrateDatabase(db, storage)).rejects.toMatchObject({
        name: StateError.name,
        code: 'INTEGRITY_FAILED',
      });
    } finally {
      if (db.isOpen) db.close();
    }
  });
});
