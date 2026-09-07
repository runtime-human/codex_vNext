import { mkdirSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';

import { StateError } from './errors.js';

export interface StorageRoot {
  root: string;
  stateDir: string;
  artifactsDir: string;
  artifactSha256Dir: string;
  backupsDir: string;
  tmpDir: string;
  databasePath: string;
}

function assertInside(root: string, candidate: string): void {
  const relative = path.relative(root, candidate);
  if (
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new StateError(
      'PATH_OUTSIDE_ROOT',
      'storage path escaped PLUGIN_DATA',
    );
  }
}

export function resolveStorageRoot(
  pluginData = process.env.PLUGIN_DATA,
): StorageRoot {
  if (!pluginData) {
    throw new StateError('STORAGE_UNAVAILABLE', 'PLUGIN_DATA is not set');
  }

  try {
    mkdirSync(pluginData, { recursive: true });
    if (!statSync(pluginData).isDirectory())
      throw new Error('PLUGIN_DATA is not a directory');

    const root = realpathSync(pluginData);
    const makeDirectory = (...segments: string[]) => {
      const requested = path.join(root, ...segments);
      mkdirSync(requested, { recursive: true });
      const resolved = realpathSync(requested);
      assertInside(root, resolved);
      return resolved;
    };

    const stateDir = makeDirectory('state');
    const artifactsDir = makeDirectory('artifacts');
    const artifactSha256Dir = makeDirectory('artifacts', 'sha256');
    const backupsDir = makeDirectory('backups');
    const tmpDir = makeDirectory('tmp');
    const databasePath = path.join(stateDir, 'workflow-next.sqlite3');
    assertInside(root, databasePath);

    return {
      root,
      stateDir,
      artifactsDir,
      artifactSha256Dir,
      backupsDir,
      tmpDir,
      databasePath,
    };
  } catch (error) {
    if (error instanceof StateError) throw error;
    throw new StateError('STORAGE_UNAVAILABLE', 'PLUGIN_DATA is not usable', {
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}
