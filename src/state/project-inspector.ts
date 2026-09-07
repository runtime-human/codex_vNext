import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { canonicalJson } from './canonical-json.js';

const execFileAsync = promisify(execFile);

export type GitRunner = (
  args: string[],
  cwd: string,
) => Promise<string | undefined>;

export interface InspectedProject {
  repoRoot: string;
  repoKey: string;
  repoFingerprint: string;
  gitAvailable: boolean;
  head?: string;
  remoteUrl?: string;
  defaultBranch?: string;
}

async function runGit(
  args: string[],
  cwd: string,
): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync('git', args, {
      cwd,
      encoding: 'utf8',
      timeout: 3_000,
      maxBuffer: 64 * 1024,
      windowsHide: true,
    });
    const value = stdout.trim();
    return value || undefined;
  } catch {
    return undefined;
  }
}

export function sanitizeRemoteUrl(value: string): string {
  if (!/^https?:\/\//i.test(value) && !/^ssh:\/\//i.test(value)) return value;
  try {
    const url = new URL(value);
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return value;
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export async function inspectProject(
  projectRoot: string,
  gitRunner: GitRunner = runGit,
): Promise<InspectedProject> {
  const safeGit = async (args: string[], cwd: string) => {
    try {
      return await gitRunner(args, cwd);
    } catch {
      return undefined;
    }
  };
  const requestedRoot = await realpath(path.resolve(projectRoot));
  const topLevel = await safeGit(
    ['rev-parse', '--show-toplevel'],
    requestedRoot,
  );
  const repoRoot = topLevel ? await realpath(topLevel) : requestedRoot;
  const [head, rawRemote, rawDefaultBranch] = await Promise.all([
    safeGit(['rev-parse', 'HEAD'], repoRoot),
    safeGit(['remote', 'get-url', 'origin'], repoRoot),
    safeGit(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], repoRoot),
  ]);
  const remoteUrl = rawRemote ? sanitizeRemoteUrl(rawRemote) : undefined;
  const defaultBranch = rawDefaultBranch?.replace(/^origin\//, '');
  const repoKey = sha256(repoRoot);
  const repoFingerprint = sha256(
    canonicalJson({
      repoRoot,
      ...(remoteUrl ? { sanitizedRemoteUrl: remoteUrl } : {}),
    }),
  );

  return {
    repoRoot,
    repoKey,
    repoFingerprint,
    gitAvailable: topLevel !== undefined,
    ...(head ? { head } : {}),
    ...(remoteUrl ? { remoteUrl } : {}),
    ...(defaultBranch ? { defaultBranch } : {}),
  };
}
