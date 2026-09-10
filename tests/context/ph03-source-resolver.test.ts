import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import {
  canonicalJson,
  migrateDatabase,
  openWorkflowDatabase,
  resolveStorageRoot,
  StateRepositories,
} from '../../src/state/index.js';

interface SourceSnapshot {
  sourceUri: string;
  status: 'resolved' | 'missing' | 'unresolvable' | 'unverifiable';
  sourceHash?: string;
}

interface SourceResolverInput {
  projectId: string;
  sourceUri: string;
}

interface SourceResolverContract {
  resolve(input: SourceResolverInput): Promise<SourceSnapshot>;
}

type SourceResolverConstructor = new (input: {
  repositories: StateRepositories;
}) => SourceResolverContract;

const tempRoots: string[] = [];

async function tempRoot(
  prefix = 'workflow-next-ph03-source-',
): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}

async function runtime(repoRoot: string) {
  const storage = resolveStorageRoot(await tempRoot('workflow-next-ph03-db-'));
  const db = openWorkflowDatabase(storage);
  await migrateDatabase(db, storage);
  const repositories = new StateRepositories(db);
  const now = '2026-09-10T18:00:00.000Z';
  repositories.putProject({
    projectId: 'project-a',
    repoRoot,
    repoKey: 'repo-a',
    repoFingerprint: 'fingerprint-a',
    createdAt: now,
    updatedAt: now,
    version: 1,
  });
  repositories.putProject({
    projectId: 'project-b',
    repoRoot: await tempRoot('workflow-next-ph03-project-b-'),
    repoKey: 'repo-b',
    repoFingerprint: 'fingerprint-b',
    createdAt: now,
    updatedAt: now,
    version: 1,
  });
  repositories.putRun({
    runId: 'run-a',
    projectId: 'project-a',
    objective: 'A',
    state: 'active',
    durable: false,
    startedAt: now,
    updatedAt: now,
    version: 1,
  });
  repositories.putRun({
    runId: 'run-b',
    projectId: 'project-b',
    objective: 'B',
    state: 'active',
    durable: false,
    startedAt: now,
    updatedAt: now,
    version: 1,
  });

  const modulePath: string = '../../src/context/source-resolver.js';
  const module = (await import(modulePath)) as {
    ContextSourceResolver?: SourceResolverConstructor;
  };
  expect(module.ContextSourceResolver).toBeDefined();
  const resolver = new (
    module.ContextSourceResolver as SourceResolverConstructor
  )({ repositories });
  return { db, repositories, resolver };
}

afterEach(async () => {
  await Promise.all(
    tempRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('PH-03 ContextSourceResolver', () => {
  it('hashes exact repository bytes and reports missing sources', async () => {
    const repoRoot = await tempRoot();
    await mkdir(path.join(repoRoot, 'src'), { recursive: true });
    const bytes = Buffer.from([0, 1, 2, 10, 13, 255]);
    await writeFile(path.join(repoRoot, 'src', 'binary.dat'), bytes);
    const { db, resolver } = await runtime(repoRoot);
    try {
      await expect(
        resolver.resolve({
          projectId: 'project-a',
          sourceUri: 'repo:src/binary.dat',
        }),
      ).resolves.toEqual({
        sourceUri: 'repo:src/binary.dat',
        status: 'resolved',
        sourceHash: createHash('sha256').update(bytes).digest('hex'),
      });
      await expect(
        resolver.resolve({
          projectId: 'project-a',
          sourceUri: 'repo:src/missing.ts',
        }),
      ).resolves.toEqual({
        sourceUri: 'repo:src/missing.ts',
        status: 'missing',
      });
    } finally {
      db.close();
    }
  });

  it('rejects repository traversal and symlink escape as unresolvable', async () => {
    const repoRoot = await tempRoot();
    const outside = await tempRoot('workflow-next-ph03-outside-');
    await mkdir(path.join(repoRoot, 'src'), { recursive: true });
    await writeFile(path.join(outside, 'secret.txt'), 'secret');
    const link = path.join(repoRoot, 'src', 'outside.txt');
    const linked = await symlink(path.join(outside, 'secret.txt'), link).then(
      () => true,
      (error: NodeJS.ErrnoException) => {
        if (error.code === 'EPERM') return false;
        throw error;
      },
    );
    const { db, resolver } = await runtime(repoRoot);
    try {
      await expect(
        resolver.resolve({
          projectId: 'project-a',
          sourceUri: 'repo:../secret',
        }),
      ).resolves.toMatchObject({ status: 'unresolvable' });
      if (linked) {
        await expect(
          resolver.resolve({
            projectId: 'project-a',
            sourceUri: 'repo:src/outside.txt',
          }),
        ).resolves.toMatchObject({ status: 'unresolvable' });
      }
    } finally {
      db.close();
    }
  });

  it('hashes canonical semantic records only when they belong to the project', async () => {
    const repoRoot = await tempRoot();
    const { db, repositories, resolver } = await runtime(repoRoot);
    const now = '2026-09-10T18:00:00.000Z';
    try {
      repositories.putDecision({
        decisionId: 'decision-a',
        runId: 'run-a',
        question: 'Choose A?',
        status: 'resolved',
        authority: 'main',
        resolution: 'A',
        version: 1,
        createdAt: now,
        updatedAt: now,
      });
      repositories.putDecision({
        decisionId: 'decision-b',
        runId: 'run-b',
        question: 'Choose B?',
        status: 'resolved',
        authority: 'main',
        resolution: 'B',
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
      repositories.putWorkItem({
        workItemId: 'work-a',
        runId: 'run-a',
        title: 'work',
        objective: 'work',
        state: 'ready',
        risk: 'low',
        acceptance: {
          requiredLevel: 'implemented',
          criteria: ['done'],
          requiredEvidenceKinds: ['test'],
        },
        readinessLevel: 'implemented',
        readinessEvidenceIds: [],
        version: 1,
        createdAt: now,
        updatedAt: now,
      });

      for (const [sourceUri, record] of [
        ['decision:decision-a', repositories.getDecision('decision-a')],
        ['evidence:evidence-a', repositories.getEvidence('evidence-a')],
        ['work:work-a', repositories.getWorkItem('work-a')],
      ] as const) {
        await expect(
          resolver.resolve({ projectId: 'project-a', sourceUri }),
        ).resolves.toEqual({
          sourceUri,
          status: 'resolved',
          sourceHash: createHash('sha256')
            .update(canonicalJson(record))
            .digest('hex'),
        });
      }

      await expect(
        resolver.resolve({
          projectId: 'project-a',
          sourceUri: 'decision:decision-b',
        }),
      ).resolves.toEqual({
        sourceUri: 'decision:decision-b',
        status: 'missing',
      });
    } finally {
      db.close();
    }
  });

  it('classifies external sources as unverifiable without fetching them', async () => {
    const repoRoot = await tempRoot();
    const { db, resolver } = await runtime(repoRoot);
    try {
      await expect(
        resolver.resolve({
          projectId: 'project-a',
          sourceUri: 'external:https://example.com/reference',
        }),
      ).resolves.toEqual({
        sourceUri: 'external:https://example.com/reference',
        status: 'unverifiable',
      });
    } finally {
      db.close();
    }
  });
});
