import { describe, expect, it } from 'vitest';

import { ContextIndexService } from '../../src/context/context-index-service.js';
import type {
  ContextRecord,
  ContextRepository,
} from '../../src/state/context-repository.js';
import type { StateRepositories } from '../../src/state/repositories.js';

const hashA = 'a'.repeat(64);
const hashB = 'b'.repeat(64);
const now = '2026-09-10T18:00:00.000Z';

function candidate(index: number): ContextRecord {
  const suffix = String(index).padStart(3, '0');
  return {
    contextId: `context-${suffix}`,
    projectId: 'project-a',
    logicalKey: `logical-${suffix}`,
    kind: 'source_pointer',
    scope: 'src/context',
    summary: `summary ${suffix}`,
    sourceUri: `repo:src/context-${suffix}.ts`,
    sourceHash: hashA,
    verifiedAt: now,
    stale: false,
    createdAt: now,
    updatedAt: now,
  };
}

function serviceFor(
  candidates: ContextRecord[],
  staleIndexes = new Set<number>(),
) {
  let calls = 0;
  const contexts = {
    listCandidates(_projectId: string, limit = 200) {
      return candidates.slice(0, Math.min(limit, 200));
    },
  } as unknown as ContextRepository;
  const service = new ContextIndexService({
    contexts,
    repositories: {} as StateRepositories,
    sourceResolver: {
      async resolve(input) {
        calls += 1;
        const index = Number(/context-(\d+)\.ts$/u.exec(input.sourceUri)?.[1]);
        return {
          sourceUri: input.sourceUri,
          status: 'resolved' as const,
          sourceHash: staleIndexes.has(index) ? hashB : hashA,
        };
      },
    },
  });
  return { service, calls: () => calls };
}

describe('PH-03 lazy freshness work contract', () => {
  it('resolves only the requested top hits when 200 ranked candidates are fresh', async () => {
    const { service, calls } = serviceFor(
      Array.from({ length: 200 }, (_, index) => candidate(index)),
    );

    const result = await service.query({
      projectId: 'project-a',
      scopes: ['src/context'],
      limit: 12,
    });

    expect(result.hits.map((hit) => hit.item.contextId)).toEqual(
      Array.from(
        { length: 12 },
        (_, index) => `context-${String(index).padStart(3, '0')}`,
      ),
    );
    expect(result.truncated).toBe(true);
    expect(calls()).toBe(12);
  });

  it('resolves through stale leaders plus one extra valid hit to prove truncation below 200 candidates', async () => {
    const staleIndexes = new Set(
      Array.from({ length: 20 }, (_, index) => index),
    );
    const { service, calls } = serviceFor(
      Array.from({ length: 40 }, (_, index) => candidate(index)),
      staleIndexes,
    );

    const result = await service.query({
      projectId: 'project-a',
      scopes: ['src/context'],
      limit: 8,
    });

    expect(result.hits.map((hit) => hit.item.contextId)).toEqual(
      Array.from(
        { length: 8 },
        (_, index) => `context-${String(index + 20).padStart(3, '0')}`,
      ),
    );
    expect(result.truncated).toBe(true);
    expect(calls()).toBe(29);
  });
});
