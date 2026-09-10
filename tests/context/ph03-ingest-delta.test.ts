import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import type {
  ContextDelta,
  ContextDeltaItem,
} from '../../src/domain/context.js';
import {
  ContextRepository,
  canonicalJson,
  migrateDatabase,
  openWorkflowDatabase,
  resolveStorageRoot,
  StateRepositories,
} from '../../src/state/index.js';

interface IngestResult {
  projectId: string;
  runId: string;
  taskId: string;
  insertedContextIds: string[];
  staleContextIds: string[];
  acceptedItems: number;
  unresolvedQuestions: string[];
}

interface ContextIndexServiceContract {
  ingestDelta(input: {
    commandId: string;
    projectId: string;
    runId: string;
    expectedTaskId: string;
    delta: ContextDelta;
  }): Promise<IngestResult>;
}

type ContextIndexServiceConstructor = new (input: {
  contexts: ContextRepository;
  repositories: StateRepositories;
  sourceResolver: {
    resolve(input: { projectId: string; sourceUri: string }): Promise<{
      sourceUri: string;
      status: 'resolved' | 'missing' | 'unresolvable' | 'unverifiable';
      sourceHash?: string;
    }>;
  };
  clock: { nowIso(): string };
}) => ContextIndexServiceContract;

const roots: string[] = [];
const now = '2026-09-10T20:00:00.000Z';
const hashA = 'a'.repeat(64);
const hashB = 'b'.repeat(64);

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'workflow-next-ph03-ingest-'));
  roots.push(root);
  return root;
}

function logicalKey(input: {
  projectId: string;
  kind: string;
  scope: string;
  sourceUri: string;
}): string {
  return createHash('sha256').update(canonicalJson(input)).digest('hex');
}

function newItem(
  sourceUri = 'repo:src/a.ts',
  overrides: Partial<ContextDeltaItem> = {},
): ContextDeltaItem {
  return {
    kind: 'new',
    contextKind: 'source_pointer',
    scope: 'src',
    summary: 'token=supersecret useful source',
    sourceUri,
    sourceHash: hashA,
    gitSha: 'abcdef0',
    ...overrides,
  };
}

function delta(
  items: ContextDeltaItem[],
  overrides: Partial<ContextDelta> = {},
): ContextDelta {
  return {
    deltaVersion: 1,
    taskId: 'task-a',
    baseRepoHead: 'head-a',
    items,
    unresolvedQuestions: [],
    ...overrides,
  };
}

async function runtime(
  snapshots: Record<
    string,
    {
      status: 'resolved' | 'missing' | 'unresolvable' | 'unverifiable';
      sourceHash?: string;
    }
  > = {},
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
  repositories.putRun({
    runId: 'run-a',
    projectId: 'project-a',
    objective: 'Run A',
    state: 'active',
    durable: false,
    lastObservedRepoHead: 'head-a',
    startedAt: now,
    updatedAt: now,
    version: 1,
  });
  repositories.putRun({
    runId: 'run-b',
    projectId: 'project-b',
    objective: 'Run B',
    state: 'active',
    durable: false,
    lastObservedRepoHead: 'head-b',
    startedAt: now,
    updatedAt: now,
    version: 1,
  });

  const contexts = new ContextRepository(db);
  const sourceResolver = {
    async resolve(input: { projectId: string; sourceUri: string }) {
      const snapshot = snapshots[input.sourceUri] ?? {
        status: 'resolved' as const,
        sourceHash: hashA,
      };
      return { sourceUri: input.sourceUri, ...snapshot };
    },
  };
  const modulePath: string = '../../src/context/context-index-service.js';
  const module = (await import(modulePath)) as {
    ContextIndexService?: ContextIndexServiceConstructor;
  };
  const service = new (
    module.ContextIndexService as ContextIndexServiceConstructor
  )({
    contexts,
    repositories,
    sourceResolver,
    clock: { nowIso: () => now },
  });
  return { db, repositories, contexts, service };
}

function persistedCounts(db: StateRepositories['db']) {
  const count = (table: string) =>
    Number(
      (
        db.prepare(`SELECT count(*) AS count FROM ${table}`).get() as {
          count: number;
        }
      ).count,
    );
  return {
    contexts: count('context_items'),
    events: count('workflow_events'),
    receipts: count('command_receipts'),
  };
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('PH-03 ContextDelta ingestion', () => {
  it('persists one redacted context version, one run event and one replayable receipt', async () => {
    const { db, repositories, contexts, service } = await runtime();
    try {
      const input = {
        commandId: 'command-a',
        projectId: 'project-a',
        runId: 'run-a',
        expectedTaskId: 'task-a',
        delta: delta([newItem()]),
      };
      const first = await service.ingestDelta(input);
      const replay = await service.ingestDelta(input);

      expect(replay).toEqual(first);
      expect(first).toMatchObject({
        projectId: 'project-a',
        runId: 'run-a',
        taskId: 'task-a',
        acceptedItems: 1,
        staleContextIds: [],
        unresolvedQuestions: [],
      });
      expect(first.insertedContextIds).toHaveLength(1);
      const stored = contexts.get(
        'project-a',
        first.insertedContextIds[0] as string,
      );
      expect(stored).toMatchObject({
        projectId: 'project-a',
        kind: 'source_pointer',
        scope: 'src',
        summary: 'token=[REDACTED] useful source',
        sourceUri: 'repo:src/a.ts',
        sourceHash: hashA,
        gitSha: 'abcdef0',
        stale: false,
      });
      expect(stored?.logicalKey).toBe(
        logicalKey({
          projectId: 'project-a',
          kind: 'source_pointer',
          scope: 'src',
          sourceUri: 'repo:src/a.ts',
        }),
      );

      expect(persistedCounts(db)).toEqual({
        contexts: 1,
        events: 1,
        receipts: 1,
      });
      expect(repositories.listEvents('run-a')).toEqual([
        expect.objectContaining({
          runId: 'run-a',
          entityType: 'run',
          entityId: 'run-a',
          eventType: 'context.delta_ingested',
          commandId: 'command-a',
          payload: expect.objectContaining({
            taskId: 'task-a',
            acceptedItems: 1,
            insertedContextIds: first.insertedContextIds,
            staleContextIds: [],
          }),
        }),
      ]);
    } finally {
      db.close();
    }
  });

  it('rejects commandId reuse with a different normalized delta', async () => {
    const { db, service } = await runtime();
    try {
      await service.ingestDelta({
        commandId: 'command-a',
        projectId: 'project-a',
        runId: 'run-a',
        expectedTaskId: 'task-a',
        delta: delta([newItem()]),
      });
      await expect(
        service.ingestDelta({
          commandId: 'command-a',
          projectId: 'project-a',
          runId: 'run-a',
          expectedTaskId: 'task-a',
          delta: delta([newItem('repo:src/b.ts')]),
        }),
      ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
      expect(persistedCounts(db)).toEqual({
        contexts: 1,
        events: 1,
        receipts: 1,
      });
    } finally {
      db.close();
    }
  });

  it('preflights every source before the transaction and rejects the whole command on mismatch', async () => {
    const { db, service } = await runtime({
      'repo:src/bad.ts': { status: 'resolved', sourceHash: hashB },
    });
    try {
      await expect(
        service.ingestDelta({
          commandId: 'command-invalid',
          projectId: 'project-a',
          runId: 'run-a',
          expectedTaskId: 'task-a',
          delta: delta([newItem(), newItem('repo:src/bad.ts')]),
        }),
      ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
      expect(persistedCounts(db)).toEqual({
        contexts: 0,
        events: 0,
        receipts: 0,
      });
    } finally {
      db.close();
    }
  });

  it('fails closed on wrong project, task or base HEAD without durable side effects', async () => {
    const { db, service } = await runtime();
    try {
      await expect(
        service.ingestDelta({
          commandId: 'wrong-project',
          projectId: 'project-b',
          runId: 'run-a',
          expectedTaskId: 'task-a',
          delta: delta([newItem()]),
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      await expect(
        service.ingestDelta({
          commandId: 'wrong-task',
          projectId: 'project-a',
          runId: 'run-a',
          expectedTaskId: 'task-b',
          delta: delta([newItem()]),
        }),
      ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
      await expect(
        service.ingestDelta({
          commandId: 'stale-base',
          projectId: 'project-a',
          runId: 'run-a',
          expectedTaskId: 'task-a',
          delta: delta([newItem()], { baseRepoHead: 'old-head' }),
        }),
      ).rejects.toMatchObject({ code: 'STALE_BASE' });
      expect(persistedCounts(db)).toEqual({
        contexts: 0,
        events: 0,
        receipts: 0,
      });
    } finally {
      db.close();
    }
  });

  it('creates a changed version and marks prior versions for the same logical key stale atomically', async () => {
    const { db, contexts, service } = await runtime({
      'repo:src/a.ts': { status: 'resolved', sourceHash: hashB },
    });
    try {
      const key = logicalKey({
        projectId: 'project-a',
        kind: 'source_pointer',
        scope: 'src',
        sourceUri: 'repo:src/a.ts',
      });
      contexts.put({
        contextId: 'context-old',
        projectId: 'project-a',
        logicalKey: key,
        kind: 'source_pointer',
        scope: 'src',
        summary: 'old',
        sourceUri: 'repo:src/a.ts',
        sourceHash: hashA,
        verifiedAt: '2026-09-10T18:00:00.000Z',
        stale: false,
        createdAt: '2026-09-10T18:00:00.000Z',
        updatedAt: '2026-09-10T18:00:00.000Z',
      });

      const result = await service.ingestDelta({
        commandId: 'command-change',
        projectId: 'project-a',
        runId: 'run-a',
        expectedTaskId: 'task-a',
        delta: delta([
          newItem('repo:src/a.ts', {
            kind: 'changed',
            summary: 'new',
            sourceHash: hashB,
            replacesContextId: 'context-old',
          }),
        ]),
      });

      expect(result.insertedContextIds).toHaveLength(1);
      expect(contexts.get('project-a', 'context-old')).toMatchObject({
        stale: true,
      });
      expect(
        contexts.get('project-a', result.insertedContextIds[0] as string),
      ).toMatchObject({
        logicalKey: key,
        sourceHash: hashB,
        stale: false,
        replacesContextId: 'context-old',
      });
      expect(persistedCounts(db)).toEqual({
        contexts: 2,
        events: 1,
        receipts: 1,
      });
    } finally {
      db.close();
    }
  });

  it('stale delta invalidates only the identified matching context version', async () => {
    const { db, contexts, service } = await runtime({
      'repo:src/a.ts': { status: 'resolved', sourceHash: hashB },
    });
    try {
      const key = logicalKey({
        projectId: 'project-a',
        kind: 'source_pointer',
        scope: 'src',
        sourceUri: 'repo:src/a.ts',
      });
      for (const [contextId, sourceHash] of [
        ['context-old', hashA],
        ['context-current', hashB],
      ] as const) {
        contexts.put({
          contextId,
          projectId: 'project-a',
          logicalKey: key,
          kind: 'source_pointer',
          scope: 'src',
          summary: contextId,
          sourceUri: 'repo:src/a.ts',
          sourceHash,
          verifiedAt: now,
          stale: false,
          createdAt: now,
          updatedAt: now,
        });
      }

      const result = await service.ingestDelta({
        commandId: 'command-stale',
        projectId: 'project-a',
        runId: 'run-a',
        expectedTaskId: 'task-a',
        delta: delta([
          newItem('repo:src/a.ts', {
            kind: 'stale',
            contextId: 'context-old',
            summary: 'old is stale',
            sourceHash: hashA,
          }),
        ]),
      });

      expect(result.insertedContextIds).toEqual([]);
      expect(result.staleContextIds).toEqual(['context-old']);
      expect(contexts.get('project-a', 'context-old')).toMatchObject({
        stale: true,
      });
      expect(contexts.get('project-a', 'context-current')).toMatchObject({
        stale: false,
      });
    } finally {
      db.close();
    }
  });
});
