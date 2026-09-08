import { createHash, randomUUID } from 'node:crypto';
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
  kind: 'compatible' | 'incompatible';
  sql: string;
}

export const INITIAL_MIGRATION: Migration = {
  version: 1,
  name: 'initial',
  kind: 'compatible',
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

  try {
    const violations = db.prepare('PRAGMA foreign_key_check').all();
    if (violations.length > 0) {
      throw new StateError(
        'INTEGRITY_FAILED',
        'SQLite foreign_key_check failed',
        { count: violations.length, first: violations[0] },
      );
    }
  } catch (error) {
    if (error instanceof StateError) throw error;
    throw new StateError('INTEGRITY_FAILED', 'SQLite foreign_key_check failed');
  }
}

export function currentSchemaVersion(db: DatabaseSync): number {
  const row = db.prepare('PRAGMA user_version').get() as {
    user_version: number;
  };
  return row.user_version;
}

interface AppliedMigration {
  version: number;
  name: string;
  checksum: string;
}

interface MigrationState {
  currentVersion: number;
  applied: Map<number, AppliedMigration>;
}

function migrationConflict(
  message: string,
  details?: Record<string, unknown>,
): StateError {
  return new StateError('MIGRATION_CONFLICT', message, details);
}

function normalizeMigrations(migrations: readonly Migration[]): Migration[] {
  const sorted = [...migrations].sort((a, b) => a.version - b.version);
  const seen = new Set<number>();
  for (const migration of sorted) {
    if (
      !Number.isSafeInteger(migration.version) ||
      migration.version <= 0 ||
      seen.has(migration.version)
    ) {
      throw migrationConflict('migration versions are invalid or duplicated', {
        version: migration.version,
      });
    }
    seen.add(migration.version);
  }
  return sorted;
}

function schemaMigrationsExist(db: DatabaseSync): boolean {
  return (
    db
      .prepare(
        "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'",
      )
      .get() !== undefined
  );
}

function readMigrationState(
  db: DatabaseSync,
  migrations: readonly Migration[],
): MigrationState {
  const currentVersion = currentSchemaVersion(db);
  const latestVersion = migrations.at(-1)?.version ?? 0;
  if (currentVersion < 0 || currentVersion > latestVersion) {
    throw migrationConflict(
      'PRAGMA user_version is outside the known migration range',
      { currentVersion, latestVersion },
    );
  }

  if (!schemaMigrationsExist(db)) {
    if (currentVersion !== 0) {
      throw migrationConflict(
        'PRAGMA user_version is set without schema_migrations',
        { currentVersion },
      );
    }
    return { currentVersion, applied: new Map() };
  }

  let rows: AppliedMigration[];
  try {
    rows = db
      .prepare(
        'SELECT version, name, checksum FROM schema_migrations ORDER BY version',
      )
      .all() as unknown as AppliedMigration[];
  } catch (error) {
    throw migrationConflict('schema_migrations cannot be read', {
      reason: error instanceof Error ? error.message : String(error),
    });
  }

  const known = new Map(
    migrations.map((migration) => [migration.version, migration]),
  );
  const applied = new Map<number, AppliedMigration>();
  for (const row of rows) {
    const migration = known.get(row.version);
    if (!migration) {
      throw migrationConflict('database contains an unknown migration row', {
        version: row.version,
      });
    }
    if (
      row.version > currentVersion ||
      row.name !== migration.name ||
      row.checksum !== checksum(migration.sql)
    ) {
      throw migrationConflict('migration state does not match its definition', {
        version: row.version,
      });
    }
    applied.set(row.version, row);
  }

  for (const migration of migrations) {
    const isApplied = applied.has(migration.version);
    if (migration.version <= currentVersion && !isApplied) {
      throw migrationConflict('PRAGMA user_version skips a migration row', {
        version: migration.version,
        currentVersion,
      });
    }
    if (migration.version > currentVersion && isApplied) {
      throw migrationConflict('migration row is ahead of PRAGMA user_version', {
        version: migration.version,
        currentVersion,
      });
    }
  }

  if (currentVersion !== 0 && !known.has(currentVersion)) {
    throw migrationConflict('PRAGMA user_version is not a known migration', {
      currentVersion,
    });
  }
  return { currentVersion, applied };
}

function backupPath(
  storage: StorageRoot,
  migration: Migration,
  clock: Clock,
): string {
  const timestamp = clock.nowIso().replaceAll(/[^0-9A-Za-z]/g, '-');
  return path.join(
    storage.backupsDir,
    `before-v${migration.version}-${timestamp}-${randomUUID()}.sqlite3`,
  );
}

export async function migrateDatabase(
  db: DatabaseSync,
  storage: StorageRoot,
  migrations: readonly Migration[] = [INITIAL_MIGRATION],
  clock: Clock = systemClock,
): Promise<void> {
  const orderedMigrations = normalizeMigrations(migrations);
  assertIntegrity(db);
  readMigrationState(db, orderedMigrations);

  for (const migration of orderedMigrations) {
    const state = readMigrationState(db, orderedMigrations);
    if (state.applied.has(migration.version)) continue;
    if (migration.kind === 'incompatible') {
      // UUID makes concurrent migrators safe even when their clocks share a tick.
      await backup(db, backupPath(storage, migration, clock));
    }

    withImmediateTransaction(db, () => {
      db.exec(migrationTableSql);
      const lockedState = readMigrationState(db, orderedMigrations);
      if (lockedState.applied.has(migration.version)) {
        return;
      }

      const expectedChecksum = checksum(migration.sql);
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

  const finalState = readMigrationState(db, orderedMigrations);
  const latestVersion = orderedMigrations.at(-1)?.version ?? 0;
  if (finalState.currentVersion !== latestVersion) {
    throw migrationConflict('database did not reach the latest migration', {
      currentVersion: finalState.currentVersion,
      latestVersion,
    });
  }
  assertIntegrity(db);
}
