import { realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import {
  assertSafeStoragePath,
  StateRepositories,
  type StorageRoot,
} from '../state/index.js';
import { type DoctorReport, runDoctor } from './doctor.js';

export * from './doctor.js';

function failed(message: string): DoctorReport {
  return {
    status: 'fail',
    checks: [{ name: 'plugin_data', status: 'fail', message }],
  };
}

export function runDoctorFromEnvironment(): DoctorReport {
  const pluginData = process.env.PLUGIN_DATA;
  if (!pluginData) return failed('PLUGIN_DATA is not set');

  let storage: StorageRoot;
  try {
    const requestedRoot = path.resolve(pluginData);
    assertSafeStoragePath(path.parse(requestedRoot).root, requestedRoot);
    assertSafeStoragePath(requestedRoot, requestedRoot);
    const root = realpathSync(requestedRoot);
    if (!statSync(root).isDirectory())
      return failed('PLUGIN_DATA is not a directory');
    assertSafeStoragePath(root, root);
    const existingDirectory = (...segments: string[]): string => {
      const requested = path.join(root, ...segments);
      assertSafeStoragePath(root, requested);
      const resolved = realpathSync(requested);
      assertSafeStoragePath(root, resolved);
      return resolved;
    };
    const stateDir = existingDirectory('state');
    const artifactsDir = existingDirectory('artifacts');
    const artifactSha256Dir = existingDirectory('artifacts', 'sha256');
    const backupsDir = existingDirectory('backups');
    const tmpDir = existingDirectory('tmp');
    const databasePath = path.join(stateDir, 'workflow-next.sqlite3');
    assertSafeStoragePath(root, databasePath);
    assertSafeStoragePath(root, `${databasePath}-wal`);
    assertSafeStoragePath(root, `${databasePath}-shm`);
    storage = {
      root,
      stateDir,
      artifactsDir,
      artifactSha256Dir,
      backupsDir,
      tmpDir,
      databasePath,
    };
  } catch {
    return failed('PLUGIN_DATA layout is unavailable');
  }

  let db: DatabaseSync | undefined;
  try {
    db = new DatabaseSync(storage.databasePath, {
      readOnly: true,
      allowExtension: false,
      defensive: true,
      timeout: 5_000,
    });
    return runDoctor({ storage, db, repositories: new StateRepositories(db) });
  } catch {
    return failed('database could not be opened read-only');
  } finally {
    if (db?.isOpen) db.close();
  }
}
