import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

interface FileMetadata {
  dev: bigint;
  ino: bigint;
  size: bigint;
  mtimeNs: bigint;
  isFile: boolean;
}

interface HashIo {
  stat(filePath: string): Promise<FileMetadata>;
  chunks(filePath: string): AsyncIterable<Uint8Array>;
}

interface StableHashResult {
  status: 'resolved' | 'unresolvable' | 'unverifiable';
  sourceHash?: string;
  bytes?: number;
}

type HashStableRepositoryFile = (
  filePath: string,
  io?: HashIo,
) => Promise<StableHashResult>;

async function loadStableHasher(): Promise<HashStableRepositoryFile> {
  const modulePath: string = '../../src/context/source-resolver.js';
  const module = (await import(modulePath)) as {
    hashStableRepositoryFile?: HashStableRepositoryFile;
  };
  expect(module.hashStableRepositoryFile).toBeDefined();
  return module.hashStableRepositoryFile as HashStableRepositoryFile;
}

function metadata(overrides: Partial<FileMetadata> = {}): FileMetadata {
  return {
    dev: 1n,
    ino: 2n,
    size: 3n,
    mtimeNs: 4n,
    isFile: true,
    ...overrides,
  };
}

function ioFor(before: FileMetadata, after: FileMetadata): HashIo {
  let calls = 0;
  return {
    async stat() {
      calls += 1;
      return calls === 1 ? before : after;
    },
    async *chunks() {
      yield Buffer.from('abc');
    },
  };
}

describe('PH-03 stable repository source hashing', () => {
  it('returns the exact digest only when the file identity is unchanged across the read', async () => {
    const hashStableRepositoryFile = await loadStableHasher();
    const snapshot = metadata();

    await expect(
      hashStableRepositoryFile('/repo/source.ts', ioFor(snapshot, snapshot)),
    ).resolves.toEqual({
      status: 'resolved',
      sourceHash: createHash('sha256').update('abc').digest('hex'),
      bytes: 3,
    });
  });

  it('fails closed when size or mtime changes while bytes are being hashed', async () => {
    const hashStableRepositoryFile = await loadStableHasher();
    const before = metadata();

    await expect(
      hashStableRepositoryFile(
        '/repo/source.ts',
        ioFor(before, metadata({ size: 4n })),
      ),
    ).resolves.toEqual({ status: 'unverifiable', bytes: 3 });
    await expect(
      hashStableRepositoryFile(
        '/repo/source.ts',
        ioFor(before, metadata({ mtimeNs: 5n })),
      ),
    ).resolves.toEqual({ status: 'unverifiable', bytes: 3 });
  });

  it('rejects non-files before reading content', async () => {
    const hashStableRepositoryFile = await loadStableHasher();
    let read = false;
    const snapshot = metadata({ isFile: false });
    const io: HashIo = {
      async stat() {
        return snapshot;
      },
      async *chunks() {
        read = true;
        yield Buffer.from('should not be read');
      },
    };

    await expect(
      hashStableRepositoryFile('/repo/directory', io),
    ).resolves.toEqual({ status: 'unresolvable', bytes: 0 });
    expect(read).toBe(false);
  });
});
