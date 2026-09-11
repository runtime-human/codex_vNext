import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ContextIndexService } from '../../src/context/context-index-service.js';
import { ContextSourceResolver } from '../../src/context/source-resolver.js';
import {
  ContextRepository,
  migrateDatabase,
  openWorkflowDatabase,
  resolveStorageRoot,
  StateRepositories,
} from '../../src/state/index.js';

const roots: string[] = [];
const now = '2026-09-11T00:00:00.000Z';

async function fixture() {
  const pluginData = await mkdtemp(
    path.join(tmpdir(), 'workflow-ph03-restart-data-'),
  );
  const projectRoot = await mkdtemp(
    path.join(tmpdir(), 'workflow-ph03-restart-repo-'),
  );
  roots.push(pluginData, projectRoot);
  await mkdir(path.join(projectRoot, 'src'), { recursive: true });
  const sourcePath = path.join(projectRoot, 'src', 'a.ts');
  const initialBytes = 'export const alpha = 1;\n';
  await writeFile(sourcePath, initialBytes);

  const storage = resolveStorageRoot(pluginData);
  const db = openWorkflowDatabase(storage);
  await migrateDatabase(db, storage);
  const repositories = new StateRepositories(db);
  repositories.putProject({
    projectId: 'project-a',
    repoRoot: projectRoot,
    repoKey: 'repo-a',
    repoFingerprint: 'fingerprint-a',
    createdAt: now,
    updatedAt: now,
    version: 1,
  });
  repositories.putRun({
    runId: 'run-a',
    projectId: 'project-a',
    objective: 'restart proof',
    state: 'active',
    durable: false,
    lastObservedRepoHead: 'head-a',
    startedAt: now,
    updatedAt: now,
    version: 1,
  });

  const service = new ContextIndexService({
    contexts: new ContextRepository(db),
    repositories,
    sourceResolver: new ContextSourceResolver({ repositories }),
    clock: { nowIso: () => now },
  });
  await service.ingestDelta({
    commandId: 'ingest-restart',
    projectId: 'project-a',
    runId: 'run-a',
    expectedTaskId: 'task-a',
    delta: {
      deltaVersion: 1,
      taskId: 'task-a',
      baseRepoHead: 'head-a',
      items: [
        {
          kind: 'new',
          contextKind: 'source_pointer',
          scope: 'src',
          summary: 'alpha module restart pointer',
          sourceUri: 'repo:src/a.ts',
          sourceHash: createHash('sha256').update(initialBytes).digest('hex'),
        },
      ],
      unresolvedQuestions: [],
    },
  });
  db.close();
  return { pluginData, projectRoot, sourcePath, storage };
}

async function reopen(storage: ReturnType<typeof resolveStorageRoot>) {
  const db = openWorkflowDatabase(storage);
  await migrateDatabase(db, storage);
  const repositories = new StateRepositories(db);
  const service = new ContextIndexService({
    contexts: new ContextRepository(db),
    repositories,
    sourceResolver: new ContextSourceResolver({ repositories }),
  });
  return { db, service };
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('PH-03 restart correctness', () => {
  it('reopens persisted context and returns the same fresh logical result', async () => {
    const { storage } = await fixture();
    const { db, service } = await reopen(storage);
    try {
      const result = await service.query({
        projectId: 'project-a',
        terms: ['alpha'],
        limit: 8,
      });
      expect(result.hits).toHaveLength(1);
      expect(result.hits[0]).toMatchObject({
        freshness: 'fresh',
        staleReason: 'none',
        item: {
          projectId: 'project-a',
          sourceUri: 'repo:src/a.ts',
          summary: 'alpha module restart pointer',
        },
      });
    } finally {
      db.close();
    }
  });

  it('detects source drift after restart without mutating persisted context', async () => {
    const { sourcePath, storage } = await fixture();
    await writeFile(sourcePath, 'export const alpha = 2;\n');

    const { db, service } = await reopen(storage);
    try {
      const normal = await service.query({
        projectId: 'project-a',
        terms: ['alpha'],
        limit: 8,
      });
      expect(normal.hits).toEqual([]);

      const diagnostic = await service.query({
        projectId: 'project-a',
        terms: ['alpha'],
        includeStale: true,
        limit: 8,
      });
      expect(diagnostic.hits).toHaveLength(1);
      expect(diagnostic.hits[0]).toMatchObject({
        freshness: 'stale',
        staleReason: 'source_hash_changed',
        item: { stale: false },
      });
      expect(db.prepare('SELECT stale FROM context_items').get()).toEqual({
        stale: 0,
      });
    } finally {
      db.close();
    }
  });
});
