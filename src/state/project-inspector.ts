import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { canonicalJson } from './canonical-json.js';
import { sanitizePersistedUri } from './redaction.js';

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

const OBJECT_ID_PATTERN = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/i;
function objectId(value: string): string | undefined {
  const candidate = value.trim();
  return OBJECT_ID_PATTERN.test(candidate) ? candidate : undefined;
}

function validRef(value: string): boolean {
  return (
    value.startsWith('refs/') &&
    value.split('/').every((part) => part && part !== '.' && part !== '..') &&
    !Array.from(value).some((character) => {
      const code = character.codePointAt(0) ?? 0;
      return character === '\\' || code <= 0x1f || code === 0x7f;
    }) &&
    !value.includes('..') &&
    !value.includes('@{')
  );
}

async function refValue(
  root: string,
  ref: string,
): Promise<string | undefined> {
  const loosePath = path.join(root, ...ref.split('/'));
  try {
    return objectId(await readFile(loosePath, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return undefined;
  }
  try {
    const content = await readFile(path.join(root, 'packed-refs'), 'utf8');
    for (const line of content.split(/\r?\n/u)) {
      const match = /^(\S+)\s+(\S+)$/u.exec(line.trim());
      if (match?.[2] === ref && match[1]) return objectId(match[1]);
    }
  } catch {
    return undefined;
  }
  return undefined;
}

async function readGitMetadataHead(
  projectRoot: string,
): Promise<string | undefined> {
  try {
    const dotGit = path.join(projectRoot, '.git');
    const dotGitStats = await lstat(dotGit);
    let gitDir: string | undefined;
    if (dotGitStats.isDirectory()) gitDir = await realpath(dotGit);
    if (dotGitStats.isFile()) {
      const pointerLine = (await readFile(dotGit, 'utf8')).trim();
      if (pointerLine.includes('\n') || pointerLine.includes('\r'))
        return undefined;
      const pointer = /^gitdir:\s*(.+)$/u.exec(pointerLine)?.[1];
      if (!pointer || pointer.includes('\0')) return undefined;
      gitDir = await realpath(path.resolve(projectRoot, pointer));
    }
    if (!gitDir || !(await lstat(gitDir)).isDirectory()) return undefined;

    let commonDir = gitDir;
    try {
      const relative = (
        await readFile(path.join(gitDir, 'commondir'), 'utf8')
      ).trim();
      if (!relative) return undefined;
      commonDir = await realpath(path.resolve(gitDir, relative));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return undefined;
    }
    if (!(await lstat(commonDir)).isDirectory()) return undefined;

    const head = (await readFile(path.join(gitDir, 'HEAD'), 'utf8')).trim();
    if (head.includes('\n') || head.includes('\r')) return undefined;
    const detached = objectId(head);
    if (detached) return detached;
    const ref = /^ref:\s*(refs\/[^\s]+)$/u.exec(head)?.[1];
    if (!ref || !validRef(ref)) return undefined;
    return (
      (await refValue(gitDir, ref)) ??
      (commonDir !== gitDir ? await refValue(commonDir, ref) : undefined)
    );
  } catch {
    return undefined;
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
  const [cliHead, rawRemote, rawDefaultBranch] = await Promise.all([
    safeGit(['rev-parse', 'HEAD'], repoRoot),
    safeGit(['remote', 'get-url', 'origin'], repoRoot),
    safeGit(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], repoRoot),
  ]);
  const fallbackHead = cliHead
    ? undefined
    : await readGitMetadataHead(repoRoot);
  const head = cliHead ?? fallbackHead;
  const remoteUrl = rawRemote ? sanitizePersistedUri(rawRemote) : undefined;
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
    gitAvailable:
      topLevel !== undefined ||
      cliHead !== undefined ||
      fallbackHead !== undefined,
    ...(head ? { head } : {}),
    ...(remoteUrl ? { remoteUrl } : {}),
    ...(defaultBranch ? { defaultBranch } : {}),
  };
}
