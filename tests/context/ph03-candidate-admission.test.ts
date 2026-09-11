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

function putContext(
  contexts: ContextRepository,
  input: {
    contextId: string;
    kind: 'pitfall' | 'source_pointer';
    scope: string;
    sourceUri: string;
    timestamp: string;
  },
) {
  contexts.put({
    contextId: input.contextId,
    projectId: 'project-a',
    logicalKey: `logical-${input.contextId}`,
    kind: input.kind,
    scope: input.scope,
    summary: `summary ${input.contextId}`,
    sourceUri: input.sourceUri,
    sourceHash,
    verifiedAt: input.timestamp,
    stale: false,
    createdAt: input.timestamp,
    updatedAt: input.timestamp,
  });
}

function addNewerNoise(
  contexts: ContextRepository,
  kind: 'pitfall' | 'source_pointer',
) {
  for (let index = 0; index < 200; index += 1) {
    const suffix = String(index).padStart(3, '0');
    putContext(contexts, {
      contextId: `context-noise-${kind}-${suffix}`,
      kind,
      scope: 'src/noise',
      sourceUri: `repo:src/noise/${kind}-${suffix}.ts`,
      timestamp: '2026-09-11T00:00:00.000Z',
    });
  }
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('PH-03 query candidate admission', () => {
  it('does not let 200 newer rows of another kind hide an older exact-scope hit', async () => {
    const { db, contexts, service } = await createRuntime();
    try {
      putContext(contexts, {
        contextId: 'context-target',
        kind: 'pitfall',
        scope: 'src/critical',
        sourceUri: 'repo:src/critical/target.ts',
        timestamp: '2026-09-10T00:00:00.000Z',
      });
      addNewerNoise(contexts, 'source_pointer');

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

  it('does not let 200 newer rows of the same kind hide an older exact-scope hit', async () => {
    const { db, contexts, service } = await createRuntime();
    try {
      putContext(contexts, {
        contextId: 'context-target-same-kind',
        kind: 'source_pointer',
        scope: 'src/critical',
        sourceUri: 'repo:src/critical/same-kind.ts',
        timestamp: '2026-09-10T00:00:00.000Z',
      });
      addNewerNoise(contexts, 'source_pointer');

      const result = await service.query({
        projectId: 'project-a',
        scopes: ['src/critical'],
        kinds: ['source_pointer'],
        limit: 1,
      });

      expect(result.hits.map((hit) => hit.item.contextId)).toEqual([
        'context-target-same-kind',
      ]);
    } finally {
      db.close();
    }
  });

  it('keeps exact and descendant matches discoverable across eight requested scopes', async () => {
    const { db, contexts, service } = await createRuntime();
    try {
      const scopes = Array.from({ length: 8 }, (_, index) =>
        `src/critical/${index}`,
      );
      const expectedIds: string[] = [];
      for (let index = 0; index < scopes.length; index += 1) {
        const scope = scopes[index];
        if (!scope) throw new Error(`missing scope ${index}`);
        const contextId = `context-scope-${index}`;
        expectedIds.push(contextId);
        putContext(contexts, {
          contextId,
          kind: 'source_pointer',
          scope: index % 2 === 0 ? scope : `${scope}/descendant`,
          sourceUri: `repo:${scope}/target-${index}.ts`,
          timestamp: '2026-09-10T00:00:00.000Z',
        });
      }
      addNewerNoise(contexts, 'source_pointer');

      const result = await service.query({
        projectId: 'project-a',
        scopes,
        kinds: ['source_pointer'],
        limit: 8,
      });

      expect(result.hits.map((hit) => hit.item.contextId).sort()).toEqual(
        expectedIds.sort(),
      );
    } finally {
      db.close();
    }
  });
});
