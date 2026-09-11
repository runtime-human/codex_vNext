import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it } from 'vitest';
import {
  migrateDatabase,
  openWorkflowDatabase,
  resolveStorageRoot,
  StateRepositories,
} from '../../src/state/index.js';

interface ContextRecord {
  contextId: string;
  projectId: string;
  logicalKey: string;
  kind:
    | 'module_summary'
    | 'source_pointer'
    | 'test_pointer'
    | 'decision_pointer'
    | 'history_pointer'
    | 'pitfall'
    | 'dependency_pointer';
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

interface ContextRepositoryContract {
  put(value: ContextRecord): void;
  get(projectId: string, contextId: string): ContextRecord | undefined;
  getByLogicalVersion(
    projectId: string,
    logicalKey: string,
    sourceHash?: string,
  ): ContextRecord | undefined;
  listCandidates(projectId: string, limit?: number): ContextRecord[];
  listByLogicalKey(
    projectId: string,
    logicalKey: string,
    limit?: number,
  ): ContextRecord[];
  markLogicalKeyStale(
    projectId: string,
    logicalKey: string,
    exceptContextId: string | undefined,
    updatedAt: string,
  ): number;
}

type ContextRepositoryConstructor = new (
  db: DatabaseSync,
) => ContextRepositoryContract;

const tempRoots: string[] = [];

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(
    path.join(tmpdir(), 'workflow-next-ph03-context-'),
  );
  tempRoots.push(root);
  return root;
}

async function runtime() {
  const storage = resolveStorageRoot(await tempRoot());
  const db = openWorkflowDatabase(storage);
  await migrateDatabase(db, storage);
  const repositories = new StateRepositories(db);
  const now = '2026-09-10T18:00:00.000Z';
  for (const suffix of ['a', 'b']) {
    repositories.putProject({
      projectId: `project-${suffix}`,
      repoRoot: `/repo/${suffix}`,
      repoKey: `repo-${suffix}`,
      repoFingerprint: `fingerprint-${suffix}`,
      createdAt: now,
      updatedAt: now,
      version: 1,
    });
  }

  const stateModule = (await import('../../src/state/index.js')) as unknown as {
    ContextRepository?: ContextRepositoryConstructor;
  };
  expect(stateModule.ContextRepository).toBeDefined();
  const contexts = new (
    stateModule.ContextRepository as ContextRepositoryConstructor
  )(db);
  return { db, contexts };
}

function record(
  contextId: string,
  projectId: string,
  overrides: Partial<ContextRecord> = {},
): ContextRecord {
  return {
    contextId,
    projectId,
    logicalKey: 'logical-source-a',
    kind: 'source_pointer',
    scope: 'src/state',
    summary: 'State service entry point',
    sourceUri: 'repo:src/state/state-service.ts',
    sourceHash: 'a'.repeat(64),
    gitSha: 'abcdef0',
    verifiedAt: '2026-09-10T18:00:00.000Z',
    stale: false,
    createdAt: '2026-09-10T18:00:00.000Z',
    updatedAt: '2026-09-10T18:00:00.000Z',
    ...overrides,
  };
}

afterEach(async () => {
  await Promise.all(
    tempRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('PH-03 ContextRepository', () => {
  it('requires project scope for lookup and never leaks another project row', async () => {
    const { db, contexts } = await runtime();
    try {
      contexts.put(record('context-a', 'project-a'));

      expect(contexts.get('project-a', 'context-a')).toMatchObject({
        contextId: 'context-a',
        projectId: 'project-a',
      });
      expect(contexts.get('project-b', 'context-a')).toBeUndefined();
    } finally {
      db.close();
    }
  });

  it('keeps identical logical source identities isolated by project', async () => {
    const { db, contexts } = await runtime();
    try {
      contexts.put(record('context-a', 'project-a'));
      contexts.put(record('context-b', 'project-b'));

      expect(
        contexts.listByLogicalKey('project-a', 'logical-source-a'),
      ).toEqual([
        expect.objectContaining({
          contextId: 'context-a',
          projectId: 'project-a',
        }),
      ]);
      expect(
        contexts.listByLogicalKey('project-b', 'logical-source-a'),
      ).toEqual([
        expect.objectContaining({
          contextId: 'context-b',
          projectId: 'project-b',
        }),
      ]);
    } finally {
      db.close();
    }
  });

  it('finds an exact logical version even when it is older than the bounded history window', async () => {
    const { db, contexts } = await runtime();
    try {
      const oldestHash = '0'.repeat(64);
      contexts.put(
        record('context-oldest', 'project-a', {
          sourceHash: oldestHash,
          verifiedAt: '2026-09-01T00:00:00.000Z',
          updatedAt: '2026-09-01T00:00:00.000Z',
        }),
      );
      for (let index = 0; index < 200; index += 1) {
        const sourceHash = (index + 1).toString(16).padStart(64, '0');
        contexts.put(
          record(`context-new-${index}`, 'project-a', {
            sourceHash,
            verifiedAt: `2026-09-10T18:${String(index % 60).padStart(2, '0')}:00.000Z`,
            updatedAt: '2026-09-11T00:00:00.000Z',
          }),
        );
      }

      expect(
        contexts.getByLogicalVersion(
          'project-a',
          'logical-source-a',
          oldestHash,
        ),
      ).toMatchObject({ contextId: 'context-oldest', sourceHash: oldestHash });
      expect(
        contexts.getByLogicalVersion(
          'project-b',
          'logical-source-a',
          oldestHash,
        ),
      ).toBeUndefined();
    } finally {
      db.close();
    }
  });

  it('bounds candidate reads to 200 rows even when a larger limit is requested', async () => {
    const { db, contexts } = await runtime();
    try {
      for (let index = 0; index < 205; index += 1) {
        contexts.put(
          record(`context-${index}`, 'project-a', {
            logicalKey: `logical-${index}`,
            sourceUri: `repo:src/${index}.ts`,
          }),
        );
      }

      const candidates = contexts.listCandidates('project-a', 500);
      expect(candidates).toHaveLength(200);
      expect(candidates.every((item) => item.projectId === 'project-a')).toBe(
        true,
      );
    } finally {
      db.close();
    }
  });

  it('marks only prior versions in the requested project stale', async () => {
    const { db, contexts } = await runtime();
    try {
      contexts.put(record('context-old-a', 'project-a'));
      contexts.put(
        record('context-new-a', 'project-a', {
          sourceHash: 'b'.repeat(64),
          replacesContextId: 'context-old-a',
        }),
      );
      contexts.put(record('context-b', 'project-b'));

      const changed = contexts.markLogicalKeyStale(
        'project-a',
        'logical-source-a',
        'context-new-a',
        '2026-09-10T19:00:00.000Z',
      );

      expect(changed).toBe(1);
      expect(contexts.get('project-a', 'context-old-a')).toMatchObject({
        stale: true,
        updatedAt: '2026-09-10T19:00:00.000Z',
      });
      expect(contexts.get('project-a', 'context-new-a')).toMatchObject({
        stale: false,
      });
      expect(contexts.get('project-b', 'context-b')).toMatchObject({
        stale: false,
      });
    } finally {
      db.close();
    }
  });
});
