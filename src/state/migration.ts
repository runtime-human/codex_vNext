import { createHash } from 'node:crypto';
import path from 'node:path';
import { backup, type DatabaseSync } from 'node:sqlite';

import { type Clock, systemClock } from './clock.js';
import { StateError } from './errors.js';
import { INITIAL_MIGRATION_SQL } from './migrations/001-initial.js';
import type { StorageRoot } from './storage-root.js';
import { withImmediateTransaction } from './transaction.js';

export interface Migration {
  version: number;
  name: string;
  sql: string;
  incompatible?: boolean;
}

export const INITIAL_MIGRATION: Migration = {
  version: 1,
  name: 'initial',
  sql: INITIAL_MIGRATION_SQL,
};

const migrationTableSql = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  checksum TEXT NOT NULL,
  applied_at TEXT NOT NULL
) STRICT;
`;

function checksum(sql: string): string {
  return createHash('sha256').update(sql).digest('hex');
}

function assertIntegrity(db: DatabaseSync): void {
  try {
    const row = db.prepare('PRAGMA quick_check').get() as
      | { quick_check?: unknown }
      | undefined;
    if (row?.quick_check !== 'ok') {
      throw new StateError('INTEGRITY_FAILED', 'SQLite quick_check failed', {
        result: row?.quick_check,
      });
    }
  } catch (error) {
    if (error instanceof StateError) throw error;
    throw new StateError('INTEGRITY_FAILED', 'SQLite quick_check failed');
  }
}

export function currentSchemaVersion(db: DatabaseSync): number {
  const row = db.prepare('PRAGMA user_version').get() as {
    user_version: number;
  };
  return row.user_version;
}

export async function migrateDatabase(
  db: DatabaseSync,
  storage: StorageRoot,
  migrations: readonly Migration[] = [INITIAL_MIGRATION],
  clock: Clock = systemClock,
): Promise<void> {
  assertIntegrity(db);

  for (const migration of [...migrations].sort(
    (a, b) => a.version - b.version,
  )) {
    const expectedChecksum = checksum(migration.sql);
    let alreadyApplied = false;
    try {
      const row = db
        .prepare(
          'SELECT name, checksum FROM schema_migrations WHERE version = ?',
        )
        .get(migration.version) as
        | { name: string; checksum: string }
        | undefined;
      alreadyApplied = row !== undefined;
      if (
        row &&
        (row.name !== migration.name || row.checksum !== expectedChecksum)
      ) {
        throw new StateError(
          'MIGRATION_CONFLICT',
          'migration checksum does not match',
          {
            version: migration.version,
          },
        );
      }
    } catch (error) {
      if (error instanceof StateError) throw error;
      // The migration table is created under the same write lock as migration 001.
    }

    if (alreadyApplied) continue;
    if (migration.incompatible) {
      const timestamp = clock.nowIso().replaceAll(/[^0-9A-Za-z]/g, '-');
      await backup(
        db,
        path.join(
          storage.backupsDir,
          `before-v${migration.version}-${timestamp}.sqlite3`,
        ),
      );
    }

    withImmediateTransaction(db, () => {
      db.exec(migrationTableSql);
      const row = db
        .prepare(
          'SELECT name, checksum FROM schema_migrations WHERE version = ?',
        )
        .get(migration.version) as
        | { name: string; checksum: string }
        | undefined;
      if (row) {
        if (row.name !== migration.name || row.checksum !== expectedChecksum) {
          throw new StateError(
            'MIGRATION_CONFLICT',
            'migration checksum does not match',
            {
              version: migration.version,
            },
          );
        }
        return;
      }

      db.exec(migration.sql);
      db.prepare(
        'INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)',
      ).run(
        migration.version,
        migration.name,
        expectedChecksum,
        clock.nowIso(),
      );
      db.exec(`PRAGMA user_version = ${migration.version}`);
    });
  }

  assertIntegrity(db);
}
