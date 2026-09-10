import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import type { CompanionHydrationCapsule } from '../../src/domain/context.js';
import {
  ContextRepository,
  migrateDatabase,
  openWorkflowDatabase,
  resolveStorageRoot,
  StateRepositories,
} from '../../src/state/index.js';

interface HydrateInput {
  taskId: string;
  projectId: string;
  runId: string;
  scopes?: string[];
  terms?: string[];
  decisionIds?: string[];
  evidenceIds?: string[];
  unresolvedQuestions?: string[];
}

interface ContextIndexServiceContract {
  hydrate(input: HydrateInput): Promise<CompanionHydrationCapsule>;
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
}) => ContextIndexServiceContract;

const roots: string[] = [];
const now = '2026-09-10T18:00:00.000Z';
const hashA = 'a'.repeat(64);

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(
    path.join(tmpdir(), 'workflow-next-ph03-hydrate-'),
  );
  roots.push(root);
  return root;
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
    objective: 'Run A objective',
    state: 'active',
    durable: false,
    repoHeadAtStart: 'head-start-a',
    lastObservedRepoHead: 'head-current-a',
    startedAt: now,
    updatedAt: now,
    version: 1,
  });
  repositories.putRun({
    runId: 'run-a2',
    projectId: 'project-a',
    objective: 'Run A2 objective',
    state: 'active',
    durable: false,
    startedAt: now,
    updatedAt: now,
    version: 1,
  });
  repositories.putRun({
    runId: 'run-b',
    projectId: 'project-b',
    objective: 'Run B objective',
    state: 'active',
    durable: false,
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
  expect(module.ContextIndexService).toBeDefined();
  const service = new (
    module.ContextIndexService as ContextIndexServiceConstructor
  )({ contexts, repositories, sourceResolver });
  return { db, repositories, contexts, service };
}

function putContext(
  contexts: ContextRepository,
  index: number,
  overrides: Partial<Parameters<ContextRepository['put']>[0]> = {},
): void {
  const suffix = String(index).padStart(2, '0');
  contexts.put({
    contextId: `context-${suffix}`,
    projectId: 'project-a',
    logicalKey: `logical-${suffix}`,
    kind: 'source_pointer',
    scope: 'src/context',
    summary: 'x'.repeat(1600),
    sourceUri: `repo:src/context-${suffix}.ts`,
    sourceHash: hashA,
    verifiedAt: now,
    stale: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('PH-03 Companion hydration', () => {
  it('builds a deterministic capsule bounded to 10 items and 14,000 summary chars', async () => {
    const { db, contexts, service } = await runtime();
    try {
      for (let index = 0; index < 12; index += 1) putContext(contexts, index);

      const first = await service.hydrate({
        taskId: 'task-a',
        projectId: 'project-a',
        runId: 'run-a',
        scopes: ['src/context'],
        unresolvedQuestions: ['What changed?'],
      });
      const second = await service.hydrate({
        taskId: 'task-a',
        projectId: 'project-a',
        runId: 'run-a',
        scopes: ['src/context'],
        unresolvedQuestions: ['What changed?'],
      });

      expect(second).toEqual(first);
      expect(first).toMatchObject({
        capsuleVersion: 1,
        taskId: 'task-a',
        projectId: 'project-a',
        runId: 'run-a',
        objective: 'Run A objective',
        repoHead: 'head-current-a',
        relevantDecisionIds: [],
        evidenceIds: [],
        unresolvedQuestions: ['What changed?'],
      });
      expect(first.contextItems.map((item) => item.contextId)).toEqual([
        'context-00',
        'context-01',
        'context-02',
        'context-03',
        'context-04',
        'context-05',
        'context-06',
        'context-07',
        'context-08',
      ]);
      expect(
        first.contextItems.reduce((sum, item) => sum + item.summary.length, 0),
      ).toBe(14_000);
      expect(first.contextItems.at(-1)?.summary).toHaveLength(1200);
      expect(
        first.contextItems.every(
          (item) =>
            item.sourceUri.startsWith('repo:src/context-') &&
            item.sourceHash === hashA,
        ),
      ).toBe(true);
    } finally {
      db.close();
    }
  });

  it('hydrates fresh context only and never promotes stale or unverifiable sources', async () => {
    const { db, contexts, service } = await runtime({
      'repo:src/context-01.ts': {
        status: 'resolved',
        sourceHash: 'b'.repeat(64),
      },
      'external:https://example.com/reference': { status: 'unverifiable' },
    });
    try {
      putContext(contexts, 0, { summary: 'fresh' });
      putContext(contexts, 1, { summary: 'changed source' });
      putContext(contexts, 2, { summary: 'persisted stale', stale: true });
      putContext(contexts, 3, {
        summary: 'external',
        sourceUri: 'external:https://example.com/reference',
        sourceHash: undefined as never,
      });

      const capsule = await service.hydrate({
        taskId: 'task-a',
        projectId: 'project-a',
        runId: 'run-a',
      });
      expect(capsule.contextItems.map((item) => item.contextId)).toEqual([
        'context-00',
      ]);
    } finally {
      db.close();
    }
  });

  it('accepts selected decision/evidence only when they belong to the same run', async () => {
    const { db, repositories, service } = await runtime();
    try {
      repositories.putDecision({
        decisionId: 'decision-a',
        runId: 'run-a',
        question: 'A?',
        status: 'resolved',
        authority: 'main',
        resolution: 'A',
        version: 1,
        createdAt: now,
        updatedAt: now,
      });
      repositories.putDecision({
        decisionId: 'decision-a2',
        runId: 'run-a2',
        question: 'A2?',
        status: 'resolved',
        authority: 'main',
        resolution: 'A2',
        version: 1,
        createdAt: now,
        updatedAt: now,
      });
      repositories.putEvidence({
        evidenceId: 'evidence-a',
        runId: 'run-a',
        kind: 'test',
        summary: 'pass',
        status: 'pass',
        createdAt: now,
      });
      repositories.putEvidence({
        evidenceId: 'evidence-b',
        runId: 'run-b',
        kind: 'test',
        summary: 'pass',
        status: 'pass',
        createdAt: now,
      });

      await expect(
        service.hydrate({
          taskId: 'task-a',
          projectId: 'project-a',
          runId: 'run-a',
          decisionIds: ['decision-a'],
          evidenceIds: ['evidence-a'],
        }),
      ).resolves.toMatchObject({
        relevantDecisionIds: ['decision-a'],
        evidenceIds: ['evidence-a'],
      });

      await expect(
        service.hydrate({
          taskId: 'task-a',
          projectId: 'project-a',
          runId: 'run-a',
          decisionIds: ['decision-a2'],
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      await expect(
        service.hydrate({
          taskId: 'task-a',
          projectId: 'project-a',
          runId: 'run-a',
          evidenceIds: ['evidence-b'],
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    } finally {
      db.close();
    }
  });

  it('rejects a run that does not belong to the requested project', async () => {
    const { db, service } = await runtime();
    try {
      await expect(
        service.hydrate({
          taskId: 'task-a',
          projectId: 'project-a',
          runId: 'run-b',
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    } finally {
      db.close();
    }
  });
});
