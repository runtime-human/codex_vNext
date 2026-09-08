import { lstatSync, mkdirSync, realpathSync, statSync } from 'node:fs';
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
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
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

export function assertSafeStoragePath(root: string, candidate: string): void {
  const absoluteRoot = path.resolve(root);
  const absoluteCandidate = path.resolve(candidate);
  assertInside(absoluteRoot, absoluteCandidate);

  const rootStats = lstatSync(absoluteRoot);
  if (rootStats.isSymbolicLink()) {
    throw new StateError(
      'PATH_OUTSIDE_ROOT',
      'storage root uses a symlink or reparse point',
    );
  }

  let current = absoluteRoot;
  const relative = path.relative(absoluteRoot, absoluteCandidate);
  for (const segment of relative ? relative.split(path.sep) : []) {
    current = path.join(current, segment);
    let stats: ReturnType<typeof lstatSync>;
    try {
      stats = lstatSync(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    if (stats.isSymbolicLink()) {
      throw new StateError(
        'PATH_OUTSIDE_ROOT',
        'storage path uses a symlink or reparse point',
      );
    }
    assertInside(absoluteRoot, realpathSync(current));
  }
}

export function resolveStorageRoot(
  pluginData = process.env.PLUGIN_DATA,
): StorageRoot {
  if (!pluginData) {
    throw new StateError('STORAGE_UNAVAILABLE', 'PLUGIN_DATA is not set');
  }

  try {
    const requestedRoot = path.resolve(pluginData);
    mkdirSync(requestedRoot, { recursive: true });
    assertSafeStoragePath(requestedRoot, requestedRoot);
    if (!statSync(requestedRoot).isDirectory())
      throw new Error('PLUGIN_DATA is not a directory');

    const root = realpathSync(requestedRoot);
    assertSafeStoragePath(root, root);
    const makeDirectory = (...segments: string[]) => {
      const requested = path.join(root, ...segments);
      assertSafeStoragePath(root, requested);
      mkdirSync(requested, { recursive: true });
      assertSafeStoragePath(root, requested);
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
    assertSafeStoragePath(root, databasePath);

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
