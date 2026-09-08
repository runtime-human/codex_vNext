import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

import { type Clock, systemClock } from './clock.js';
import { StateError } from './errors.js';
import { newArtifactId } from './ids.js';
import type { ArtifactRecord, StateRepositories } from './repositories.js';
import { assertSafeStoragePath, type StorageRoot } from './storage-root.js';

const MAX_ARTIFACT_BYTES = 10 * 1024 * 1024;

interface ArtifactStoreDependencies {
  storage: StorageRoot;
  repositories: StateRepositories;
  clock?: Clock;
}

interface PutBytesInput {
  bytes: Uint8Array;
  mediaType: string;
  preview?: string;
}

function relativeCasPath(hash: string): string {
  return `artifacts/sha256/${hash.slice(0, 2)}/${hash}`;
}

export function artifactFileMatches(
  artifact: Pick<ArtifactRecord, 'sha256' | 'byteSize'>,
  absolutePath: string,
): boolean {
  try {
    const stats = lstatSync(absolutePath);
    if (
      !stats.isFile() ||
      stats.size !== artifact.byteSize ||
      stats.size > MAX_ARTIFACT_BYTES
    )
      return false;
    const bytes = readFileSync(absolutePath);
    return createHash('sha256').update(bytes).digest('hex') === artifact.sha256;
  } catch {
    return false;
  }
}

export class ArtifactStore {
  private readonly clock: Clock;

  constructor(private readonly dependencies: ArtifactStoreDependencies) {
    this.clock = dependencies.clock ?? systemClock;
  }

  putBytes(input: PutBytesInput): ArtifactRecord {
    if (input.bytes.byteLength > MAX_ARTIFACT_BYTES) {
      throw new StateError(
        'INVALID_ARGUMENT',
        'artifact exceeds the 10 MiB limit',
      );
    }
    const sha256 = createHash('sha256').update(input.bytes).digest('hex');
    const relativePath = relativeCasPath(sha256);
    const destination = this.insideRoot(relativePath);
    mkdirSync(path.dirname(destination), { recursive: true });
    this.insideRoot(relativePath);

    if (!existsSync(destination)) {
      const temporary = path.join(
        this.dependencies.storage.tmpDir,
        `artifact-${randomUUID()}.tmp`,
      );
      const handle = openSync(temporary, 'wx');
      let written = false;
      try {
        writeFileSync(handle, input.bytes);
        fsyncSync(handle);
        written = true;
      } finally {
        closeSync(handle);
        if (!written) unlinkSync(temporary);
      }
      try {
        renameSync(temporary, destination);
      } catch (error) {
        unlinkSync(temporary);
        if (!existsSync(destination)) throw error;
      }
    }
    this.insideRoot(relativePath);
    if (
      !artifactFileMatches(
        { sha256, byteSize: input.bytes.byteLength },
        destination,
      )
    ) {
      throw new StateError('INTEGRITY_FAILED', 'CAS object content mismatch');
    }

    const existing = this.dependencies.repositories.getArtifactBySha256(sha256);
    if (existing) return existing;
    const metadata: ArtifactRecord = {
      artifactId: newArtifactId(),
      sha256,
      byteSize: input.bytes.byteLength,
      mediaType: input.mediaType,
      relativePath,
      ...(input.preview ? { preview: input.preview } : {}),
      createdAt: this.clock.nowIso(),
    };
    try {
      this.dependencies.repositories.putArtifact(metadata);
      return metadata;
    } catch (error) {
      const raced = this.dependencies.repositories.getArtifactBySha256(sha256);
      if (raced) return raced;
      throw error;
    }
  }

  get(artifactId: string): ArtifactRecord | undefined {
    return this.dependencies.repositories.getArtifact(artifactId);
  }

  resolvePath(artifactId: string): string {
    const artifact = this.get(artifactId);
    if (!artifact) throw new StateError('NOT_FOUND', 'artifact not found');
    return this.insideRoot(artifact.relativePath);
  }

  listOrphans(): string[] {
    const known = new Set(
      this.dependencies.repositories
        .listArtifacts()
        .map((item) => item.relativePath),
    );
    const found: string[] = [];
    for (const prefix of readdirSync(
      this.dependencies.storage.artifactSha256Dir,
      {
        withFileTypes: true,
      },
    )) {
      if (!prefix.isDirectory()) continue;
      for (const item of readdirSync(
        path.join(this.dependencies.storage.artifactSha256Dir, prefix.name),
        { withFileTypes: true },
      )) {
        if (!item.isFile()) continue;
        const relative = `artifacts/sha256/${prefix.name}/${item.name}`;
        if (!known.has(relative)) found.push(relative);
      }
    }
    return found.sort();
  }

  private insideRoot(relativePath: string): string {
    const absolute = path.resolve(this.dependencies.storage.root, relativePath);
    assertSafeStoragePath(this.dependencies.storage.root, absolute);
    return absolute;
  }
}
