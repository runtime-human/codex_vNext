import { accessSync, constants, existsSync } from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

import {
  ALL_MIGRATIONS,
  ArtifactStore,
  artifactFileMatches,
  assertSafeStoragePath,
  migrationChecksum,
  StateRepositories,
  type StorageRoot,
} from '../state/index.js';

export interface DoctorCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
}

export interface DoctorReport {
  status: 'pass' | 'warn' | 'fail';
  checks: DoctorCheck[];
}

function addCheck(
  checks: DoctorCheck[],
  name: string,
  ok: boolean,
  failure: DoctorCheck['status'],
  passMessage: string,
  failureMessage: string,
): void {
  checks.push({
    name,
    status: ok ? 'pass' : failure,
    message: ok ? passMessage : failureMessage,
  });
}

export function runDoctor(input: {
  storage: StorageRoot;
  db: DatabaseSync;
  repositories?: StateRepositories;
}): DoctorReport {
  const { storage, db } = input;
  const repositories = input.repositories ?? new StateRepositories(db);
  const checks: DoctorCheck[] = [];

  try {
    for (const directory of [
      storage.root,
      storage.stateDir,
      storage.artifactsDir,
      storage.backupsDir,
      storage.tmpDir,
    ])
      accessSync(directory, constants.W_OK);
    addCheck(
      checks,
      'storage_writable',
      true,
      'fail',
      'storage is writable',
      'storage is not writable',
    );
  } catch {
    addCheck(
      checks,
      'storage_writable',
      false,
      'fail',
      'storage is writable',
      'storage is not writable',
    );
  }

  addCheck(
    checks,
    'database_open',
    db.isOpen,
    'fail',
    'database is open',
    'database is closed',
  );
  const pragma = (name: string, column: string): unknown => {
    try {
      return (db.prepare(`PRAGMA ${name}`).get() as Record<string, unknown>)[
        column
      ];
    } catch {
      return undefined;
    }
  };
  addCheck(
    checks,
    'foreign_keys',
    pragma('foreign_keys', 'foreign_keys') === 1,
    'fail',
    'foreign keys enabled',
    'foreign keys disabled',
  );
  addCheck(
    checks,
    'journal_mode',
    pragma('journal_mode', 'journal_mode') === 'wal',
    'fail',
    'journal mode is wal',
    'journal mode is not wal',
  );
  addCheck(
    checks,
    'synchronous',
    pragma('synchronous', 'synchronous') === 2,
    'fail',
    'synchronous is full',
    'synchronous is not full',
  );
  addCheck(
    checks,
    'quick_check',
    pragma('quick_check', 'quick_check') === 'ok',
    'fail',
    'quick_check is ok',
    'quick_check failed',
  );

  let migrationHealthy = false;
  try {
    const rows = db
      .prepare(
        'SELECT version, name, checksum FROM schema_migrations ORDER BY version',
      )
      .all() as unknown as Array<{
      version: number;
      name: string;
      checksum: string;
    }>;
    migrationHealthy =
      rows.length === ALL_MIGRATIONS.length &&
      rows.every((row, index) => {
        const expected = ALL_MIGRATIONS[index];
        return (
          expected !== undefined &&
          row.version === expected.version &&
          row.name === expected.name &&
          row.checksum === migrationChecksum(expected.sql)
        );
      });
  } catch {
    migrationHealthy = false;
  }
  addCheck(
    checks,
    'migration_checksum',
    migrationHealthy,
    'fail',
    'migration chain checksums match',
    'migration chain checksum mismatch',
  );
  const latestMigrationVersion = ALL_MIGRATIONS.at(-1)?.version ?? 0;
  addCheck(
    checks,
    'schema_version',
    pragma('user_version', 'user_version') === latestMigrationVersion,
    'fail',
    'schema version is current',
    'schema version mismatch',
  );

  let foreignKeysHealthy = false;
  try {
    foreignKeysHealthy =
      db.prepare('PRAGMA foreign_key_check').all().length === 0;
  } catch {
    foreignKeysHealthy = false;
  }
  addCheck(
    checks,
    'foreign_key_check',
    foreignKeysHealthy,
    'fail',
    'foreign keys are valid',
    'foreign key violations found',
  );

  let artifactTargetsHealthy = false;
  try {
    artifactTargetsHealthy = repositories.listArtifacts().every((artifact) => {
      const absolute = path.resolve(storage.root, artifact.relativePath);
      assertSafeStoragePath(storage.root, absolute);
      return existsSync(absolute) && artifactFileMatches(artifact, absolute);
    });
  } catch {
    artifactTargetsHealthy = false;
  }
  addCheck(
    checks,
    'artifact_targets',
    artifactTargetsHealthy,
    'fail',
    'artifact targets exist and match metadata',
    'referenced artifact target is missing or corrupt',
  );

  let orphanCount: number | undefined;
  try {
    orphanCount = new ArtifactStore({ storage, repositories }).listOrphans()
      .length;
  } catch {
    orphanCount = undefined;
  }
  checks.push(
    orphanCount === undefined
      ? {
          name: 'orphan_cas',
          status: 'fail',
          message: 'CAS objects could not be inspected',
        }
      : {
          name: 'orphan_cas',
          status: orphanCount === 0 ? 'pass' : 'warn',
          message:
            orphanCount === 0
              ? 'no orphan CAS objects'
              : `${orphanCount} orphan CAS object(s)`,
        },
  );

  const count = (sql: string): number | undefined => {
    try {
      return Number((db.prepare(sql).get() as { count: number }).count);
    } catch {
      return undefined;
    }
  };
  const cleanupCount = count(
    'SELECT count(*) AS count FROM resources WHERE cleanup_required = 1',
  );
  checks.push(
    cleanupCount === undefined
      ? {
          name: 'cleanup_required',
          status: 'fail',
          message: 'cleanup state could not be inspected',
        }
      : {
          name: 'cleanup_required',
          status: cleanupCount === 0 ? 'pass' : 'warn',
          message:
            cleanupCount === 0
              ? 'no cleanup required'
              : `${cleanupCount} resource(s) require cleanup`,
        },
  );
  const activeCount = count(
    "SELECT count(*) AS count FROM resources WHERE status IN ('attached', 'running')",
  );
  checks.push(
    activeCount === undefined
      ? {
          name: 'resource_liveness',
          status: 'fail',
          message: 'resource liveness state could not be inspected',
        }
      : {
          name: 'resource_liveness',
          status: activeCount === 0 ? 'pass' : 'warn',
          message:
            activeCount === 0
              ? 'no persisted active resources'
              : `${activeCount} active resource(s) have unknown liveness`,
        },
  );

  const status = checks.some((item) => item.status === 'fail')
    ? 'fail'
    : checks.some((item) => item.status === 'warn')
      ? 'warn'
      : 'pass';
  return { status, checks };
}
