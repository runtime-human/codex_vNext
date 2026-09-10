import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it } from 'vitest';
import type { ContextKind } from '../../src/domain/context.js';
import {
  ContextRepository,
  migrateDatabase,
  openWorkflowDatabase,
  resolveStorageRoot,
  StateRepositories,
} from '../../src/state/index.js';

interface ContextRecord {
  contextId: string;
  projectId: string;
  logicalKey: string;
  kind: ContextKind;
  scope: string;
  summary: string;
  sourceUri: string;
  sourceHash?: string;
  gitSha?: string;
  verifiedAt: string;
  stale: boolean;
  replacesContextId?: string;
  createdAt: string;
  updatedAt: string;
}

interface SourceSnapshot {
  sourceUri: string;
  status: 'resolved' | 'missing' | 'unresolvable' | 'unverifiable';
  sourceHash?: string;
}

interface QueryHit {
  item: ContextRecord;
  freshness: 'fresh' | 'stale' | 'unverifiable';
  staleReason:
    | 'persisted_stale'
    | 'source_missing'
    | 'source_hash_changed'
    | 'source_unresolvable'
    | 'none';
  score: number;
}

interface QueryResult {
  projectId: string;
  hits: QueryHit[];
  truncated: boolean;
}

interface ContextIndexServiceContract {
  get(input: {
    projectId: string;
    contextId: string;
    includeStale?: boolean;
    includeUnverifiable?: boolean;
  }): Promise<QueryHit | undefined>;
  query(input: {
    projectId: string;
    scopes?: string[];
    kinds?: ContextKind[];
    terms?: string[];
    includeStale?: boolean;
    includeUnverifiable?: boolean;
    limit?: number;
  }): Promise<QueryResult>;
}

type ContextIndexServiceConstructor = new (input: {
  contexts: ContextRepository;
  sourceResolver: {
    resolve(input: {
      projectId: string;
      sourceUri: string;
    }): Promise<SourceSnapshot>;
  };
}) => ContextIndexServiceContract;

type ScoreContextCandidate = (
  item: ContextRecord,
  query: { scopes?: string[]; terms?: string[] },
) => number;

const tempRoots: string[] = [];
const now = '2026-09-10T18:00:00.000Z';

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'workflow-next-ph03-query-'));
  tempRoots.push(root);
  return root;
}

function record(
  contextId: string,
  overrides: Partial<ContextRecord> = {},
): ContextRecord {
  return {
    contextId,
    projectId: 'project-a',
    logicalKey: `logical-${contextId}`,
    kind: 'source_pointer',
    scope: 'src/state',
    summary: 'Migration context summary',
    sourceUri: `repo:src/${contextId}.ts`,
    sourceHash: 'a'.repeat(64),
    gitSha: 'abcdef0',
    verifiedAt: now,
    stale: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

async function runtime(
  snapshots: Record<string, Omit<SourceSnapshot, 'sourceUri'>> = {},
) {
  const storage = resolveStorageRoot(await tempRoot());
  const db = openWorkflowDatabase(storage);
  await migrateDatabase(db, storage);
  const repositories = new StateRepositories(db);
  repositories.putProject({
    projectId: 'project-a',
    repoRoot: await tempRoot(),
    repoKey: 'repo-a',
    repoFingerprint: 'fingerprint-a',
    createdAt: now,
    updatedAt: now,
    version: 1,
  });
  repositories.putProject({
    projectId: 'project-b',
    repoRoot: await tempRoot(),
    repoKey: 'repo-b',
    repoFingerprint: 'fingerprint-b',
    createdAt: now,
    updatedAt: now,
    version: 1,
  });
  const contexts = new ContextRepository(db);
  const calls: Array<{ projectId: string; sourceUri: string }> = [];
  const sourceResolver = {
    async resolve(input: { projectId: string; sourceUri: string }) {
      calls.push(input);
      const snapshot = snapshots[input.sourceUri] ?? {
        status: 'resolved' as const,
        sourceHash: 'a'.repeat(64),
      };
      return { sourceUri: input.sourceUri, ...snapshot };
    },
  };
  const modulePath: string = '../../src/context/context-index-service.js';
  const module = (await import(modulePath)) as {
    ContextIndexService?: ContextIndexServiceConstructor;
    scoreContextCandidate?: ScoreContextCandidate;
  };
  expect(module.ContextIndexService).toBeDefined();
  expect(module.scoreContextCandidate).toBeDefined();
  const service = new (
    module.ContextIndexService as ContextIndexServiceConstructor
  )({ contexts, sourceResolver });
  return {
    db,
    contexts,
    service,
    scoreContextCandidate: module.scoreContextCandidate as ScoreContextCandidate,
    calls,
  };
}

afterEach(async () => {
  await Promise.all(
    tempRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('PH-03 ContextIndexService query', () => {
  it('scores exact scope, normalized terms and freshness deterministically', async () => {
    const { db, scoreContextCandidate } = await runtime();
    try {
      const item = record('score', {
        sourceUri: 'repo:src/state/migration.ts',
        summary: 'Migration lookup',
      });
      expect(
        scoreContextCandidate(item, {
          scopes: ['src/state'],
          terms: ['  ＭＩＧＲＡＴＩＯＮ  '],
        }),
      ).toBe(135);

      expect(
        scoreContextCandidate(
          record('prefix', {
            scope: 'src/state/migrations',
            sourceUri: 'repo:src/state/other.ts',
            summary: 'Other',
          }),
          { scopes: ['src/state'] },
        ),
      ).toBe(70);
    } finally {
      db.close();
    }
  });

  it('applies per-field term caps and deterministic tie-breaks', async () => {
    const { db, contexts, service, scoreContextCandidate } = await runtime();
    try {
      const allTerms = ['one', 'two', 'three', 'four', 'five'];
      const joined = allTerms.join('-');
      expect(
        scoreContextCandidate(
          record('caps', {
            scope: joined,
            sourceUri: `repo:${joined}`,
            summary: joined,
          }),
          { terms: allTerms },
        ),
      ).toBe(170);

      contexts.put(
        record('context-c', {
          verifiedAt: '2026-09-10T18:01:00.000Z',
          sourceUri: 'repo:src/context-c.ts',
        }),
      );
      contexts.put(
        record('context-b', {
          verifiedAt: '2026-09-10T18:02:00.000Z',
          sourceUri: 'repo:src/context-b.ts',
        }),
      );
      contexts.put(
        record('context-a', {
          verifiedAt: '2026-09-10T18:02:00.000Z',
          sourceUri: 'repo:src/context-a.ts',
        }),
      );

      const result = await service.query({
        projectId: 'project-a',
        scopes: ['src/state'],
        limit: 3,
      });
      expect(result.hits.map((hit) => hit.item.contextId)).toEqual([
        'context-a',
        'context-b',
        'context-c',
      ]);
    } finally {
      db.close();
    }
  });

  it('derives freshness from current source identity and filters unsafe hits by default', async () => {
    const { db, contexts, service } = await runtime({
      'repo:src/changed.ts': {
        status: 'resolved',
        sourceHash: 'b'.repeat(64),
      },
      'repo:src/missing.ts': { status: 'missing' },
      'repo:src/unresolvable.ts': { status: 'unresolvable' },
      'external:https://example.com/reference': { status: 'unverifiable' },
    });
    try {
      contexts.put(record('fresh'));
      contexts.put(
        record('changed', { sourceUri: 'repo:src/changed.ts' }),
      );
      contexts.put(
        record('missing', { sourceUri: 'repo:src/missing.ts' }),
      );
      contexts.put(
        record('unresolvable', { sourceUri: 'repo:src/unresolvable.ts' }),
      );
      contexts.put(
        record('persisted', {
          sourceUri: 'repo:src/persisted.ts',
          stale: true,
        }),
      );
      contexts.put(
        record('external', {
          sourceUri: 'external:https://example.com/reference',
          sourceHash: undefined,
        }),
      );

      const defaultResult = await service.query({ projectId: 'project-a' });
      expect(defaultResult.hits.map((hit) => hit.item.contextId)).toEqual([
        'fresh',
      ]);

      const expanded = await service.query({
        projectId: 'project-a',
        includeStale: true,
        includeUnverifiable: true,
        limit: 12,
      });
      const freshness = Object.fromEntries(
        expanded.hits.map((hit) => [
          hit.item.contextId,
          [hit.freshness, hit.staleReason],
        ]),
      );
      expect(freshness).toMatchObject({
        fresh: ['fresh', 'none'],
        changed: ['stale', 'source_hash_changed'],
        missing: ['stale', 'source_missing'],
        unresolvable: ['stale', 'source_unresolvable'],
        persisted: ['stale', 'persisted_stale'],
        external: ['unverifiable', 'none'],
      });

      expect(contexts.get('project-a', 'changed')).toMatchObject({
        sourceHash: 'a'.repeat(64),
        stale: false,
        verifiedAt: now,
      });
    } finally {
      db.close();
    }
  });

  it('keeps get/query project-scoped and bounds freshness work to 200 candidates', async () => {
    const { db, contexts, service, calls } = await runtime();
    try {
      contexts.put(record('shared-id', { projectId: 'project-a' }));
      contexts.put(
        record('shared-id-b', {
          projectId: 'project-b',
          sourceUri: 'repo:src/project-b.ts',
        }),
      );
      expect(
        await service.get({ projectId: 'project-b', contextId: 'shared-id' }),
      ).toBeUndefined();

      for (let index = 0; index < 205; index += 1) {
        contexts.put(
          record(`bounded-${index}`, {
            logicalKey: `bounded-logical-${index}`,
            sourceUri: `repo:src/bounded-${index}.ts`,
            updatedAt: `2026-09-10T19:${String(index % 60).padStart(2, '0')}:00.000Z`,
          }),
        );
      }

      calls.length = 0;
      const result = await service.query({
        projectId: 'project-a',
        limit: 12,
      });
      expect(result.hits).toHaveLength(12);
      expect(calls.length).toBeLessThanOrEqual(200);
      expect(result.truncated).toBe(true);
      expect(result.hits.every((hit) => hit.item.projectId === 'project-a')).toBe(
        true,
      );
    } finally {
      db.close();
    }
  });
});
