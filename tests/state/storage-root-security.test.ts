import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const race = {
  requestedRoot: undefined as string | undefined,
  outsideRoot: undefined as string | undefined,
};

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    mkdirSync: vi.fn(
      (
        requested: Parameters<typeof actual.mkdirSync>[0],
        options?: Parameters<typeof actual.mkdirSync>[1],
      ) => {
        const result = actual.mkdirSync(requested, options);
        if (
          race.requestedRoot &&
          race.outsideRoot &&
          path.resolve(String(requested)) === race.requestedRoot
        ) {
          const requestedRoot = race.requestedRoot;
          const outsideRoot = race.outsideRoot;
          race.requestedRoot = undefined;
          actual.mkdirSync(outsideRoot, { recursive: true });
          actual.rmSync(requestedRoot, { recursive: true, force: true });
          actual.rmSync(path.dirname(requestedRoot), {
            recursive: true,
            force: true,
          });
          actual.symlinkSync(
            path.dirname(outsideRoot),
            path.dirname(requestedRoot),
            process.platform === 'win32' ? 'junction' : 'dir',
          );
        }
        return result;
      },
    ),
  };
});

import { resolveStorageRoot } from '../../src/state/index.js';

const roots: string[] = [];

afterEach(async () => {
  race.requestedRoot = undefined;
  race.outsideRoot = undefined;
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true });
  }
});

describe('storage root containment after canonicalization', () => {
  it('rejects an ancestor junction introduced after mkdir', async () => {
    const parent = await mkdtemp(path.join(tmpdir(), 'workflow-next-race-'));
    const outside = await mkdtemp(
      path.join(tmpdir(), 'workflow-next-race-outside-'),
    );
    roots.push(parent, outside);
    const requestedRoot = path.join(parent, 'plugin-data');
    race.requestedRoot = path.resolve(requestedRoot);
    race.outsideRoot = path.join(outside, 'plugin-data');

    expect(() => resolveStorageRoot(requestedRoot)).toThrowError(
      expect.objectContaining({ code: 'PATH_OUTSIDE_ROOT' }),
    );
  });
});
