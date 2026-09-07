import { execFile } from 'node:child_process';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';
import {
  inspectProject,
  migrateDatabase,
  openWorkflowDatabase,
  resolveStorageRoot,
  StateRepositories,
} from '../../src/state/index.js';

const execFileAsync = promisify(execFile);
const tempRoots: string[] = [];

async function tempRoot(prefix = 'workflow-next-state-'): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, {
    cwd,
    encoding: 'utf8',
  });
  return stdout.trim();
}

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true })),
  );
});

describe('project inspector', () => {
  it('canonicalizes a Git root, sanitizes remote credentials and excludes HEAD from identity', async () => {
    const root = await tempRoot('workflow-next-git-');
    await git(root, 'init');
    await git(root, 'config', 'user.email', 'test@example.com');
    await git(root, 'config', 'user.name', 'Test');
    await writeFile(path.join(root, 'file.txt'), 'one');
    await git(root, 'add', 'file.txt');
    await git(root, 'commit', '-m', 'one');
    await git(
      root,
      'remote',
      'add',
      'origin',
      'https://user:password@example.com/org/repo.git?token=secret#fragment',
    );

    const first = await inspectProject(path.join(root, '.'));
    await writeFile(path.join(root, 'file.txt'), 'two');
    await git(root, 'add', 'file.txt');
    await git(root, 'commit', '-m', 'two');
    const second = await inspectProject(root);

    expect(first.repoRoot).toBe(await realpath(root));
    expect(first.remoteUrl).toBe('https://example.com/org/repo.git');
    expect(first.head).toMatch(/^[0-9a-f]{40}$/);
    expect(second.head).not.toBe(first.head);
    expect(second.repoFingerprint).toBe(first.repoFingerprint);
    expect(second.repoKey).toBe(first.repoKey);
  });

  it('allows a non-Git directory and degrades bounded Git failures without stderr', async () => {
    const root = await tempRoot();
    const failedCalls: string[][] = [];
    const inspected = await inspectProject(root, async (args) => {
      failedCalls.push(args);
      throw new Error('private stderr must not persist');
    });

    expect(inspected.repoRoot).toBe(await realpath(root));
    expect(inspected.gitAvailable).toBe(false);
    expect(inspected).not.toHaveProperty('error');
    expect(JSON.stringify(inspected)).not.toContain('private stderr');
    expect(failedCalls.every((args) => args.length > 0)).toBe(true);
  });
});

describe('state repositories', () => {
  it('round-trips every PH-02 entity through typed adapters', async () => {
    const storage = resolveStorageRoot(await tempRoot());
    const db = openWorkflowDatabase(storage);
    await migrateDatabase(db, storage);
    const repositories = new StateRepositories(db);
    const at = '2026-09-08T00:00:00Z';

    try {
      repositories.putProject({
        projectId: 'project-1',
        repoRoot: '/repo',
        repoKey: 'key',
        repoFingerprint: 'fingerprint',
        remoteUrl: 'https://example.com/repo.git',
        defaultBranch: 'main',
        createdAt: at,
        updatedAt: at,
        version: 1,
      });
      repositories.putRun({
        runId: 'run-1',
        projectId: 'project-1',
        objective: 'objective',
        state: 'active',
        durable: false,
        repoHeadAtStart: 'abc',
        lastObservedRepoHead: 'abc',
        startedAt: at,
        updatedAt: at,
        version: 1,
      });
      repositories.putWorkItem({
        workItemId: 'work-1',
        runId: 'run-1',
        title: 'title',
        objective: 'objective',
        state: 'ready',
        risk: 'medium',
        acceptance: {
          requiredLevel: 'validated_local',
          criteria: ['tests pass'],
          requiredEvidenceKinds: ['test'],
        },
        readinessLevel: 'implemented',
        readinessEvidenceIds: [],
        version: 1,
        createdAt: at,
        updatedAt: at,
      });
      repositories.putDecision({
        decisionId: 'decision-1',
        runId: 'run-1',
        workItemId: 'work-1',
        question: 'question',
        status: 'pending',
        authority: 'main',
        version: 1,
        createdAt: at,
        updatedAt: at,
      });
      repositories.putArtifact({
        artifactId: 'artifact-1',
        sha256: 'a'.repeat(64),
        byteSize: 3,
        mediaType: 'text/plain',
        relativePath: 'artifacts/sha256/aa/hash',
        preview: 'abc',
        createdAt: at,
      });
      repositories.putEvidence({
        evidenceId: 'evidence-1',
        runId: 'run-1',
        workItemId: 'work-1',
        kind: 'test',
        summary: 'passed',
        status: 'pass',
        artifactId: 'artifact-1',
        createdAt: at,
      });
      repositories.putResource({
        resourceId: 'resource-1',
        runId: 'run-1',
        workItemId: 'work-1',
        type: 'test_run',
        control: 'coordinated',
        owner: 'main',
        nativeRef: 'native-1',
        status: 'running',
        cleanupRequired: true,
        version: 1,
        createdAt: at,
        updatedAt: at,
      });
      repositories.appendEvent({
        eventId: 'event-1',
        runId: 'run-1',
        entityType: 'run',
        entityId: 'run-1',
        eventType: 'run.started',
        payload: { state: 'active' },
        commandId: 'command-1',
        createdAt: at,
      });

      expect(repositories.getProject('project-1')?.remoteUrl).toBe(
        'https://example.com/repo.git',
      );
      expect(repositories.getRun('run-1')?.durable).toBe(false);
      expect(repositories.getWorkItem('work-1')?.acceptance.criteria).toEqual([
        'tests pass',
      ]);
      expect(repositories.getDecision('decision-1')?.status).toBe('pending');
      expect(repositories.getEvidence('evidence-1')?.artifactId).toBe(
        'artifact-1',
      );
      expect(repositories.getArtifact('artifact-1')?.byteSize).toBe(3);
      expect(repositories.getResource('resource-1')?.cleanupRequired).toBe(
        true,
      );
      expect(repositories.listEvents('run-1')).toMatchObject([
        { eventId: 'event-1', payload: { state: 'active' } },
      ]);
    } finally {
      db.close();
    }
  });

  it('keeps SQLite constraints active', async () => {
    const storage = resolveStorageRoot(await tempRoot());
    const db = openWorkflowDatabase(storage);
    await migrateDatabase(db, storage);
    const repositories = new StateRepositories(db);
    try {
      expect(() =>
        repositories.putRun({
          runId: 'invalid',
          projectId: 'missing',
          objective: 'invalid',
          state: 'unknown' as 'active',
          durable: false,
          startedAt: '2026-09-08T00:00:00Z',
          updatedAt: '2026-09-08T00:00:00Z',
          version: 1,
        }),
      ).toThrow();
    } finally {
      db.close();
    }
  });

  it('updates work items with optimistic version checks', async () => {
    const storage = resolveStorageRoot(await tempRoot());
    const db = openWorkflowDatabase(storage);
    await migrateDatabase(db, storage);
    const repositories = new StateRepositories(db);
    const at = '2026-09-08T00:00:00Z';
    try {
      repositories.putProject({
        projectId: 'project-1',
        repoRoot: '/repo',
        repoKey: 'key',
        repoFingerprint: 'fingerprint',
        createdAt: at,
        updatedAt: at,
        version: 1,
      });
      repositories.putRun({
        runId: 'run-1',
        projectId: 'project-1',
        objective: 'objective',
        state: 'active',
        durable: false,
        startedAt: at,
        updatedAt: at,
        version: 1,
      });
      repositories.putWorkItem({
        workItemId: 'work-1',
        runId: 'run-1',
        title: 'before',
        objective: 'objective',
        state: 'ready',
        risk: 'low',
        acceptance: {
          requiredLevel: 'implemented',
          criteria: ['implemented'],
          requiredEvidenceKinds: [],
        },
        readinessLevel: 'implemented',
        readinessEvidenceIds: [],
        version: 1,
        createdAt: at,
        updatedAt: at,
      });

      expect(
        repositories.updateWorkItem('work-1', 1, { title: 'after' }, at)
          .version,
      ).toBe(2);
      expect(() =>
        repositories.updateWorkItem('work-1', 1, { title: 'stale' }, at),
      ).toThrowError(expect.objectContaining({ code: 'VERSION_CONFLICT' }));
    } finally {
      db.close();
    }
  });
});
