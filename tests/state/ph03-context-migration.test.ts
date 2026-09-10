import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import {
  currentSchemaVersion,
  migrateDatabase,
  openWorkflowDatabase,
  resolveStorageRoot,
} from '../../src/state/index.js';

const tempRoots: string[] = [];

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(
    path.join(tmpdir(), 'workflow-next-ph03-migration-'),
  );
  tempRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    tempRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('PH-03 context migration', () => {
  it('advances the production schema to version 2', async () => {
    const storage = resolveStorageRoot(await tempRoot());
    const db = openWorkflowDatabase(storage);
    try {
      await migrateDatabase(db, storage);

      expect(currentSchemaVersion(db)).toBe(2);
      expect(
        db
          .prepare(
            'SELECT version, name FROM schema_migrations ORDER BY version',
          )
          .all(),
      ).toEqual([
        { version: 1, name: 'initial' },
        { version: 2, name: 'context-index' },
      ]);
    } finally {
      db.close();
    }
  });

  it('creates context_items as a strict project-scoped table', async () => {
    const storage = resolveStorageRoot(await tempRoot());
    const db = openWorkflowDatabase(storage);
    try {
      await migrateDatabase(db, storage);

      const table = db.prepare("PRAGMA table_list('context_items')").get() as
        | { name: string; strict: number }
        | undefined;
      expect(table).toMatchObject({ name: 'context_items', strict: 1 });

      const columns = db
        .prepare("PRAGMA table_info('context_items')")
        .all()
        .map((row) => (row as { name: string }).name);
      expect(columns).toEqual([
        'context_id',
        'project_id',
        'logical_key',
        'kind',
        'scope',
        'summary',
        'source_uri',
        'source_hash',
        'git_sha',
        'verified_at',
        'stale',
        'replaces_context_id',
        'created_at',
        'updated_at',
      ]);

      const foreignKeys = db
        .prepare("PRAGMA foreign_key_list('context_items')")
        .all()
        .map((row) => row as { from: string; table: string });
      expect(foreignKeys).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ from: 'project_id', table: 'projects' }),
          expect.objectContaining({
            from: 'replaces_context_id',
            table: 'context_items',
          }),
        ]),
      );
    } finally {
      db.close();
    }
  });

  it('enforces one logical source version per project and source hash', async () => {
    const storage = resolveStorageRoot(await tempRoot());
    const db = openWorkflowDatabase(storage);
    try {
      await migrateDatabase(db, storage);
      db.prepare(`INSERT INTO projects (
        project_id, repo_root, repo_key, repo_fingerprint,
        created_at, updated_at, version
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
        'project-a',
        '/repo/a',
        'repo-a',
        'fingerprint-a',
        '2026-09-10T00:00:00.000Z',
        '2026-09-10T00:00:00.000Z',
        1,
      );

      const insert = db.prepare(`INSERT INTO context_items (
        context_id, project_id, logical_key, kind, scope, summary,
        source_uri, source_hash, verified_at, stale, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      const values = [
        'project-a',
        'logical-key',
        'source_pointer',
        'src',
        'summary',
        'repo:src/a.ts',
        'a'.repeat(64),
        '2026-09-10T00:00:00.000Z',
        0,
        '2026-09-10T00:00:00.000Z',
        '2026-09-10T00:00:00.000Z',
      ] as const;
      insert.run('context-1', ...values);
      expect(() => insert.run('context-2', ...values)).toThrow();
    } finally {
      db.close();
    }
  });
});
