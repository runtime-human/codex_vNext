import { realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { StateRepositories, type StorageRoot } from '../state/index.js';
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
    const root = realpathSync(pluginData);
    if (!statSync(root).isDirectory())
      return failed('PLUGIN_DATA is not a directory');
    const stateDir = realpathSync(path.join(root, 'state'));
    const artifactsDir = realpathSync(path.join(root, 'artifacts'));
    storage = {
      root,
      stateDir,
      artifactsDir,
      artifactSha256Dir: realpathSync(path.join(artifactsDir, 'sha256')),
      backupsDir: realpathSync(path.join(root, 'backups')),
      tmpDir: realpathSync(path.join(root, 'tmp')),
      databasePath: path.join(stateDir, 'workflow-next.sqlite3'),
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
