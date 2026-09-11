import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ContextRepository } from '../../src/state/context-repository.js';
import {
  migrateDatabase,
  openWorkflowDatabase,
  resolveStorageRoot,
  StateRepositories,
} from '../../src/state/index.js';

const MIB = 1024 * 1024;
const roots: string[] = [];
const sourceHash = 'a'.repeat(64);

interface VerificationBudget {
  remainingBytes: number;
  perSourceMaxBytes: number;
}

interface ContextIndexServiceContract {
  query(input: {
    projectId: string;
    includeUnverifiable?: boolean;
    limit?: number;
  }): Promise<{
    hits: Array<{
      item: { contextId: string };
      freshness: 'fresh' | 'stale' | 'unverifiable';
    }>;
  }>;
}

type ContextIndexServiceConstructor = new (input: {
  contexts: ContextRepository;
  repositories: StateRepositories;
  sourceResolver: {
    resolve(input: {
      projectId: string;
      sourceUri: string;
      verificationBudget?: VerificationBudget;
    }): Promise<{
      sourceUri: string;
      status: 'resolved' | 'unverifiable';
      sourceHash?: string;
    }>;
  };
}) => ContextIndexServiceContract;

async function runtime() {
  const pluginData = await mkdtemp(path.join(tmpdir(), 'ph03-budget-'));
  const repoRoot = await mkdtemp(path.join(tmpdir(), 'ph03-budget-repo-'));
  roots.push(pluginData, repoRoot);
  const storage = resolveStorageRoot(pluginData);
  const db = openWorkflowDatabase(storage);
  await migrateDatabase(db, storage);
  const repositories = new StateRepositories(db);
  repositories.putProject({
    projectId: 'project-a',
    repoRoot,
    repoKey: 'repo-a',
    repoFingerprint: 'fingerprint-a',
    createdAt: '2026-09-10T00:00:00.000Z',
    updatedAt: '2026-09-11T00:00:00.000Z',
    version: 1,
  });
  const contexts = new ContextRepository(db);
  for (const id of ['a', 'b', 'c']) {
    contexts.put({
      contextId: `context-${id}`,
      projectId: 'project-a',
      logicalKey: `logical-${id}`,
      kind: 'source_pointer',
      scope: 'src',
      summary: `context ${id}`,
      sourceUri: `repo:src/${id}.ts`,
      sourceHash,
      verifiedAt: '2026-09-11T00:00:00.000Z',
      stale: false,
      createdAt: '2026-09-11T00:00:00.000Z',
      updatedAt: '2026-09-11T00:00:00.000Z',
    });
  }

  const observedBudgets: VerificationBudget[] = [];
  const sourceResolver = {
    async resolve(input: {
      projectId: string;
      sourceUri: string;
      verificationBudget?: VerificationBudget;
    }) {
      const budget = input.verificationBudget;
      expect(budget).toBeDefined();
      observedBudgets.push(budget as VerificationBudget);
      expect(budget?.perSourceMaxBytes).toBe(16 * MIB);
      const cost = 16 * MIB;
      if (!budget || budget.remainingBytes < cost) {
        return { sourceUri: input.sourceUri, status: 'unverifiable' as const };
      }
      budget.remainingBytes -= cost;
      return {
        sourceUri: input.sourceUri,
        status: 'resolved' as const,
        sourceHash,
      };
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
  return { db, service, observedBudgets };
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('PH-03 source verification budget', () => {
  it('shares one 32 MiB budget across all repository freshness checks in a query', async () => {
    const { db, service, observedBudgets } = await runtime();
    try {
      const result = await service.query({
        projectId: 'project-a',
        includeUnverifiable: true,
        limit: 3,
      });

      expect(result.hits.map((hit) => [hit.item.contextId, hit.freshness])).toEqual([
        ['context-a', 'fresh'],
        ['context-b', 'fresh'],
        ['context-c', 'unverifiable'],
      ]);
      expect(observedBudgets).toHaveLength(3);
      expect(new Set(observedBudgets).size).toBe(1);
      expect(observedBudgets[0]).toMatchObject({
        remainingBytes: 0,
        perSourceMaxBytes: 16 * MIB,
      });
    } finally {
      db.close();
    }
  });
});
