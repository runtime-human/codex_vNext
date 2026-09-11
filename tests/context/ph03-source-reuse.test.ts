import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ContextIndexService } from '../../src/context/context-index-service.js';
import { ContextRepository } from '../../src/state/context-repository.js';
import {
  migrateDatabase,
  openWorkflowDatabase,
  resolveStorageRoot,
  StateRepositories,
} from '../../src/state/index.js';

const roots: string[] = [];
const sourceHash = 'a'.repeat(64);

async function runtime() {
  const pluginData = await mkdtemp(path.join(tmpdir(), 'ph03-source-reuse-'));
  const repoRoot = await mkdtemp(path.join(tmpdir(), 'ph03-source-reuse-repo-'));
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
  for (const [index, kind] of (
    ['source_pointer', 'pitfall'] as const
  ).entries()) {
    const suffix = String(index + 1);
    contexts.put({
      contextId: `context-${suffix}`,
      projectId: 'project-a',
      logicalKey: `logical-${suffix}`,
      kind,
      scope: `src/${suffix}`,
      summary: `context ${suffix}`,
      sourceUri: 'repo:src/shared.ts',
      sourceHash,
      verifiedAt: `2026-09-11T00:00:0${suffix}.000Z`,
      stale: false,
      createdAt: `2026-09-11T00:00:0${suffix}.000Z`,
      updatedAt: `2026-09-11T00:00:0${suffix}.000Z`,
    });
  }

  let resolverCalls = 0;
  const service = new ContextIndexService({
    contexts,
    repositories,
    sourceResolver: {
      async resolve(input) {
        resolverCalls += 1;
        return {
          sourceUri: input.sourceUri,
          status: 'resolved' as const,
          sourceHash,
        };
      },
    },
  });
  return { db, service, resolverCalls: () => resolverCalls };
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('PH-03 request-local source snapshot reuse', () => {
  it('resolves one shared source once per query but never caches it across queries', async () => {
    const { db, service, resolverCalls } = await runtime();
    try {
      const first = await service.query({
        projectId: 'project-a',
        limit: 2,
      });
      expect(first.hits).toHaveLength(2);
      expect(first.hits.every((hit) => hit.freshness === 'fresh')).toBe(true);
      expect(resolverCalls()).toBe(1);

      const second = await service.query({
        projectId: 'project-a',
        limit: 2,
      });
      expect(second.hits).toHaveLength(2);
      expect(resolverCalls()).toBe(2);
    } finally {
      db.close();
    }
  });
});
