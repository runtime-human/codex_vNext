import { describe, expect, it } from 'vitest';

type ParseSchema = { parse(value: unknown): unknown };

async function contextContracts() {
  return (await import('../../src/domain/context.js')) as unknown as Record<
    string,
    unknown
  >;
}

function parseSchema(
  contracts: Record<string, unknown>,
  name: string,
): ParseSchema | undefined {
  const value = contracts[name];
  return value && typeof value === 'object' && 'parse' in value
    ? (value as ParseSchema)
    : undefined;
}

describe('PH-03 context domain contracts', () => {
  it('exports the stable context kind contract without changing PH-01 values', async () => {
    const contracts = await contextContracts();
    const schema = parseSchema(contracts, 'ContextKindSchema');
    expect(schema).toBeDefined();

    const values = [
      'module_summary',
      'source_pointer',
      'test_pointer',
      'decision_pointer',
      'history_pointer',
      'pitfall',
      'dependency_pointer',
    ];
    expect(values.map((value) => schema?.parse(value))).toEqual(values);
    expect(() => schema?.parse('semantic_memory')).toThrow();
  });

  it('accepts only canonical source URI forms', async () => {
    const contracts = await contextContracts();
    const schema = parseSchema(contracts, 'ContextSourceUriSchema');
    expect(schema).toBeDefined();

    for (const value of [
      'repo:src/state/state-service.ts',
      'decision:decision-123',
      'evidence:evidence-456',
      'work:work-789',
      'external:https://example.com/path',
    ]) {
      expect(schema?.parse(value)).toBe(value);
    }

    for (const value of [
      'repo:../secret.txt',
      'repo:/absolute.txt',
      'repo:C:/windows.txt',
      'repo:src\\windows.ts',
      'external:https://user:pass@example.com/path',
      'external:https://example.com/path?token=secret',
      'external:https://example.com/path#fragment',
      'ftp://example.com/file',
      'unknown:value',
    ]) {
      expect(() => schema?.parse(value)).toThrow();
    }
  });

  it('separates persisted stale state from derived freshness', async () => {
    const contracts = await contextContracts();
    const freshness = parseSchema(contracts, 'ContextFreshnessSchema');
    const reason = parseSchema(contracts, 'ContextStaleReasonSchema');
    expect(freshness).toBeDefined();
    expect(reason).toBeDefined();

    expect(
      ['fresh', 'stale', 'unverifiable'].map((value) =>
        freshness?.parse(value),
      ),
    ).toEqual(['fresh', 'stale', 'unverifiable']);
    expect(
      [
        'persisted_stale',
        'source_missing',
        'source_hash_changed',
        'source_unresolvable',
        'none',
      ].map((value) => reason?.parse(value)),
    ).toEqual([
      'persisted_stale',
      'source_missing',
      'source_hash_changed',
      'source_unresolvable',
      'none',
    ]);
  });

  it('defaults bounded queries and rejects unknown fields', async () => {
    const contracts = await contextContracts();
    const schema = parseSchema(contracts, 'ContextQuerySchema');
    expect(schema).toBeDefined();

    expect(schema?.parse({ projectId: 'project-1' })).toEqual({
      projectId: 'project-1',
      scopes: [],
      kinds: [],
      terms: [],
      includeStale: false,
      includeUnverifiable: false,
      limit: 8,
    });
    expect(() =>
      schema?.parse({ projectId: 'project-1', limit: 13 }),
    ).toThrow();
    expect(() =>
      schema?.parse({ projectId: 'project-1', extra: true }),
    ).toThrow();
  });

  it('bounds hydration and ContextDelta payloads', async () => {
    const contracts = await contextContracts();
    const hydration = parseSchema(contracts, 'CompanionHydrationCapsuleSchema');
    const delta = parseSchema(contracts, 'ContextDeltaSchema');
    expect(hydration).toBeDefined();
    expect(delta).toBeDefined();

    const item = {
      contextId: 'context-1',
      projectId: 'project-1',
      kind: 'source_pointer',
      scope: 'src/state',
      summary: 'State service entry point',
      sourceUri: 'repo:src/state/state-service.ts',
      sourceHash: 'a'.repeat(64),
      gitSha: 'abcdef0',
      verifiedAt: '2026-09-10T18:00:00.000Z',
      stale: false,
    };

    expect(
      hydration?.parse({
        capsuleVersion: 1,
        taskId: 'task-1',
        projectId: 'project-1',
        runId: 'run-1',
        objective: 'Understand state flow',
        contextItems: [item],
        relevantDecisionIds: [],
        evidenceIds: [],
        unresolvedQuestions: [],
      }),
    ).toBeDefined();

    expect(
      delta?.parse({
        deltaVersion: 1,
        taskId: 'task-1',
        baseRepoHead: 'abcdef0',
        items: [
          {
            kind: 'new',
            contextKind: 'source_pointer',
            scope: 'src/state',
            summary: 'State service entry point',
            sourceUri: 'repo:src/state/state-service.ts',
            sourceHash: 'a'.repeat(64),
            gitSha: 'abcdef0',
          },
        ],
        unresolvedQuestions: [],
      }),
    ).toBeDefined();

    expect(() =>
      delta?.parse({
        deltaVersion: 1,
        taskId: 'task-1',
        items: Array.from({ length: 17 }, (_, index) => ({
          kind: 'new',
          contextKind: 'source_pointer',
          scope: `src/${index}`,
          summary: 'bounded',
          sourceUri: `repo:src/${index}.ts`,
          sourceHash: 'a'.repeat(64),
        })),
        unresolvedQuestions: [],
      }),
    ).toThrow();
  });
});
