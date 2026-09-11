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

async function createRuntime() {
  const pluginData = await mkdtemp(path.join(tmpdir(), 'ph03-admission-'));
  const repoRoot = await mkdtemp(path.join(tmpdir(), 'ph03-admission-repo-'));
  roots.push(pluginData, repoRoot);
  const storage = resolveStorageRoot(pluginData);
  const db = openWorkflowDatabase(storage);
  await migrateDatabase(db, storage);
  const contexts = new ContextRepository(db);
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
  return { db, contexts, service };
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('PH-03 query candidate admission', () => {
  it('does not let 200 newer irrelevant rows hide an older exact-scope hit', async () => {
    const { db, contexts, service } = await createRuntime();
    try {
      contexts.put({
        contextId: 'context-target',
        projectId: 'project-a',
        logicalKey: 'logical-target',
        kind: 'pitfall',
        scope: 'src/critical',
        summary: 'the relevant older context',
        sourceUri: 'repo:src/critical/target.ts',
        sourceHash,
        verifiedAt: '2026-09-10T00:00:00.000Z',
        stale: false,
        createdAt: '2026-09-10T00:00:00.000Z',
        updatedAt: '2026-09-10T00:00:00.000Z',
      });

      for (let index = 0; index < 200; index += 1) {
        const suffix = String(index).padStart(3, '0');
        contexts.put({
          contextId: `context-noise-${suffix}`,
          projectId: 'project-a',
          logicalKey: `logical-noise-${suffix}`,
          kind: 'source_pointer',
          scope: 'src/noise',
          summary: `newer irrelevant candidate ${suffix}`,
          sourceUri: `repo:src/noise/${suffix}.ts`,
          sourceHash,
          verifiedAt: '2026-09-11T00:00:00.000Z',
          stale: false,
          createdAt: '2026-09-11T00:00:00.000Z',
          updatedAt: '2026-09-11T00:00:00.000Z',
        });
      }

      const result = await service.query({
        projectId: 'project-a',
        scopes: ['src/critical'],
        kinds: ['pitfall'],
        limit: 1,
      });

      expect(result.hits.map((hit) => hit.item.contextId)).toEqual([
        'context-target',
      ]);
    } finally {
      db.close();
    }
  });
});
