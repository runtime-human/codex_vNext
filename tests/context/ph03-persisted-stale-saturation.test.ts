import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ContextIndexService } from '../../src/context/context-index-service.js';
import {
  ContextRepository,
  migrateDatabase,
  openWorkflowDatabase,
  resolveStorageRoot,
  StateRepositories,
} from '../../src/state/index.js';

const roots: string[] = [];
const sourceHash = 'a'.repeat(64);

async function runtime() {
  const pluginData = await mkdtemp(
    path.join(tmpdir(), 'ph03-stale-saturation-'),
  );
  const projectRoot = await mkdtemp(path.join(tmpdir(), 'ph03-stale-project-'));
  roots.push(pluginData, projectRoot);

  const storage = resolveStorageRoot(pluginData);
  const db = openWorkflowDatabase(storage);
  await migrateDatabase(db, storage);
  const repositories = new StateRepositories(db);
  repositories.putProject({
    projectId: 'project-a',
    repoRoot: projectRoot,
    repoKey: 'repo-a',
    repoFingerprint: 'fingerprint-a',
    createdAt: '2026-09-10T00:00:00.000Z',
    updatedAt: '2026-09-11T00:00:00.000Z',
    version: 1,
  });

  const contexts = new ContextRepository(db);
  contexts.put({
    contextId: 'context-fresh',
    projectId: 'project-a',
    logicalKey: 'logical-fresh',
    kind: 'source_pointer',
    scope: 'src',
    summary: 'the only eligible fresh pointer',
    sourceUri: 'repo:src/fresh.ts',
    sourceHash,
    verifiedAt: '2026-09-10T00:00:00.000Z',
    stale: false,
    createdAt: '2026-09-10T00:00:00.000Z',
    updatedAt: '2026-09-10T00:00:00.000Z',
  });

  for (let index = 0; index < 200; index += 1) {
    const suffix = String(index).padStart(3, '0');
    contexts.put({
      contextId: `context-stale-${suffix}`,
      projectId: 'project-a',
      logicalKey: `logical-stale-${suffix}`,
      kind: 'source_pointer',
      scope: 'src',
      summary: `persisted stale ${suffix}`,
      sourceUri: `repo:src/stale-${suffix}.ts`,
      sourceHash,
      verifiedAt: '2026-09-11T00:00:00.000Z',
      stale: true,
      createdAt: '2026-09-11T00:00:00.000Z',
      updatedAt: '2026-09-11T00:00:00.000Z',
    });
  }

  const service = new ContextIndexService({
    contexts,
    repositories,
    sourceResolver: {
      async resolve(input) {
        return {
          sourceUri: input.sourceUri,
          status: 'resolved' as const,
          sourceHash,
        };
      },
    },
  });
  return { db, service };
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('PH-03 persisted stale saturation', () => {
  it('does not let 200 newer persisted-stale rows hide an older fresh candidate from default query', async () => {
    const { db, service } = await runtime();
    try {
      const result = await service.query({
        projectId: 'project-a',
        scopes: ['src'],
        limit: 8,
      });

      expect(result.hits.map((hit) => hit.item.contextId)).toEqual([
        'context-fresh',
      ]);
      expect(result.hits[0]).toMatchObject({
        freshness: 'fresh',
        staleReason: 'none',
      });
    } finally {
      db.close();
    }
  });
});
