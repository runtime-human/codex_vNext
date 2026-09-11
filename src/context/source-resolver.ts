import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';

import { ContextSourceUriSchema } from '../domain/context.js';
import {
  canonicalJson,
  type ProjectRecord,
  type StateRepositories,
} from '../state/index.js';

export type ContextSourceStatus =
  | 'resolved'
  | 'missing'
  | 'unresolvable'
  | 'unverifiable';

export interface ContextSourceSnapshot {
  sourceUri: string;
  status: ContextSourceStatus;
  sourceHash?: string;
}

export interface ContextSourceResolverDependencies {
  repositories: StateRepositories;
}

export interface RepositoryFileMetadata {
  dev: bigint;
  ino: bigint;
  size: bigint;
  mtimeNs: bigint;
  isFile: boolean;
}

export interface RepositoryFileHashIo {
  stat(filePath: string): Promise<RepositoryFileMetadata>;
  chunks(filePath: string): AsyncIterable<Uint8Array>;
}

export interface StableRepositoryFileHashResult {
  status: 'resolved' | 'unresolvable' | 'unverifiable';
  sourceHash?: string;
  bytes: number;
}

const nodeRepositoryFileHashIo: RepositoryFileHashIo = {
  async stat(filePath) {
    const value = await stat(filePath, { bigint: true });
    return {
      dev: value.dev,
      ino: value.ino,
      size: value.size,
      mtimeNs: value.mtimeNs,
      isFile: value.isFile(),
    };
  },
  chunks(filePath) {
    return createReadStream(filePath);
  },
};

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function sameRepositoryFileSnapshot(
  before: RepositoryFileMetadata,
  after: RepositoryFileMetadata,
): boolean {
  return (
    before.dev === after.dev &&
    before.ino === after.ino &&
    before.size === after.size &&
    before.mtimeNs === after.mtimeNs
  );
}

export async function hashStableRepositoryFile(
  filePath: string,
  io: RepositoryFileHashIo = nodeRepositoryFileHashIo,
): Promise<StableRepositoryFileHashResult> {
  const before = await io.stat(filePath);
  if (!before.isFile) return { status: 'unresolvable', bytes: 0 };

  const hash = createHash('sha256');
  let bytes = 0;
  for await (const chunk of io.chunks(filePath)) {
    hash.update(chunk);
    bytes += chunk.byteLength;
  }

  const after = await io.stat(filePath);
  if (
    !after.isFile ||
    !sameRepositoryFileSnapshot(before, after) ||
    BigInt(bytes) !== before.size
  ) {
    return { status: 'unverifiable', bytes };
  }

  return {
    status: 'resolved',
    sourceHash: hash.digest('hex'),
    bytes,
  };
}

function missing(sourceUri: string): ContextSourceSnapshot {
  return { sourceUri, status: 'missing' };
}

function unresolvable(sourceUri: string): ContextSourceSnapshot {
  return { sourceUri, status: 'unresolvable' };
}

function entityId(sourceUri: string): string {
  return sourceUri.slice(sourceUri.indexOf(':') + 1);
}

export class ContextSourceResolver {
  constructor(
    private readonly dependencies: ContextSourceResolverDependencies,
  ) {}

  async resolve(input: {
    projectId: string;
    sourceUri: string;
  }): Promise<ContextSourceSnapshot> {
    const parsed = ContextSourceUriSchema.safeParse(input.sourceUri);
    if (!parsed.success) return unresolvable(input.sourceUri);
    const sourceUri = parsed.data;
    const project = this.dependencies.repositories.getProject(input.projectId);
    if (!project) return missing(sourceUri);

    if (sourceUri.startsWith('external:')) {
      return { sourceUri, status: 'unverifiable' };
    }
    if (sourceUri.startsWith('repo:')) {
      return await this.resolveRepositorySource(project, sourceUri);
    }
    return this.resolveSemanticSource(project, sourceUri);
  }

  private async resolveRepositorySource(
    project: ProjectRecord,
    sourceUri: string,
  ): Promise<ContextSourceSnapshot> {
    try {
      const canonicalRoot = await realpath(project.repoRoot);
      const requested = path.resolve(
        canonicalRoot,
        sourceUri.slice('repo:'.length).split('/').join(path.sep),
      );
      const relativeRequested = path.relative(canonicalRoot, requested);
      if (
        relativeRequested === '..' ||
        relativeRequested.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relativeRequested)
      ) {
        return unresolvable(sourceUri);
      }

      const resolved = await realpath(requested);
      const relativeResolved = path.relative(canonicalRoot, resolved);
      if (
        relativeResolved === '..' ||
        relativeResolved.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relativeResolved)
      ) {
        return unresolvable(sourceUri);
      }

      const result = await hashStableRepositoryFile(resolved);
      if (result.status !== 'resolved') {
        return { sourceUri, status: result.status };
      }
      return {
        sourceUri,
        status: 'resolved',
        sourceHash: result.sourceHash,
      };
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === 'ENOENT'
        ? missing(sourceUri)
        : unresolvable(sourceUri);
    }
  }

  private resolveSemanticSource(
    project: ProjectRecord,
    sourceUri: string,
  ): ContextSourceSnapshot {
    const repositories = this.dependencies.repositories;
    const id = entityId(sourceUri);
    const record = sourceUri.startsWith('decision:')
      ? repositories.getDecision(id)
      : sourceUri.startsWith('evidence:')
        ? repositories.getEvidence(id)
        : sourceUri.startsWith('work:')
          ? repositories.getWorkItem(id)
          : undefined;
    if (!record) return missing(sourceUri);

    const run = repositories.getRun(record.runId);
    if (!run || run.projectId !== project.projectId) return missing(sourceUri);
    return {
      sourceUri,
      status: 'resolved',
      sourceHash: sha256(canonicalJson(record)),
    };
  }
}
