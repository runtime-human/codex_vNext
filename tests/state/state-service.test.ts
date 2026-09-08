import { execFile } from 'node:child_process';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import type { WorkItemState } from '../../src/domain/index.js';
import {
  inspectProject,
  migrateDatabase,
  openWorkflowDatabase,
  resolveStorageRoot,
  StateRepositories,
  StateService,
  sanitizePersistedUri,
} from '../../src/state/index.js';

const execFileAsync = promisify(execFile);
const tempRoots: string[] = [];
const openDatabases: DatabaseSync[] = [];
const at = '2026-09-08T00:00:00Z';
const fixedClock = { nowIso: () => at };

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
  for (const db of openDatabases.splice(0)) if (db.isOpen) db.close();
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true })),
  );
});

async function stateRuntime(beforeEvent?: () => void) {
  const pluginData = await tempRoot();
  const storage = resolveStorageRoot(pluginData);
  const db = openWorkflowDatabase(storage);
  openDatabases.push(db);
  await migrateDatabase(db, storage);
  const repositories = new StateRepositories(db);
  const service = new StateService({
    db,
    repositories,
    clock: fixedClock,
    ...(beforeEvent ? { beforeEvent } : {}),
  });
  return { db, repositories, service, pluginData };
}

function seedRun(repositories: StateRepositories): void {
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
}

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

  it('sanitizes non-HTTP and malformed credential-bearing remotes fail-closed', () => {
    expect(
      sanitizePersistedUri('ftp://user:secret@example.com/repo?token=hidden'),
    ).toBe('ftp://example.com/repo');
    expect(sanitizePersistedUri('git@example.com:org/repo.git')).toBe(
      'example.com:org/repo.git',
    );
    expect(sanitizePersistedUri('https://user:secret@@')).toBeUndefined();
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

  it('uses insertion order to break equal run timestamps deterministically', async () => {
    const { repositories } = await stateRuntime();
    seedRun(repositories);
    repositories.putRun({
      runId: 'run-2',
      projectId: 'project-1',
      objective: 'newer insertion',
      state: 'active',
      durable: false,
      startedAt: at,
      updatedAt: at,
      version: 1,
    });

    expect(repositories.getLatestRunForProject('project-1')?.runId).toBe(
      'run-2',
    );
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

describe('semantic state service', () => {
  it('begins a workflow idempotently and rejects durable mode', async () => {
    const { service, pluginData } = await stateRuntime();
    const input = {
      commandId: 'begin-1',
      projectRoot: pluginData,
      objective: 'Implement PH-02',
      durable: false,
    };

    const first = await service.beginWorkflow(input);
    expect(await service.beginWorkflow(input)).toEqual(first);
    expect(first.runId).toMatch(/^run_/);
    await expect(
      service.beginWorkflow({ ...input, commandId: 'begin-2', durable: true }),
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  });

  it('creates and patches work without allowing state bypass or stale versions', async () => {
    const { service, pluginData } = await stateRuntime();
    const run = await service.beginWorkflow({
      commandId: 'begin-work',
      projectRoot: pluginData,
      objective: 'Work mutations',
      durable: false,
    });
    const created = service.updateWorkItem({
      operation: 'create',
      commandId: 'work-create',
      runId: run.runId,
      title: 'Before',
      objective: 'Objective',
      risk: 'low',
      acceptance: {
        requiredLevel: 'implemented',
        criteria: ['implemented'],
        requiredEvidenceKinds: [],
      },
    });
    const patched = service.updateWorkItem({
      operation: 'patch',
      commandId: 'work-patch',
      workItemId: created.workItemId,
      expectedVersion: 1,
      patch: { title: 'After' },
    });

    expect(patched).toMatchObject({
      title: 'After',
      state: 'ready',
      version: 2,
    });
    expect(() =>
      service.updateWorkItem({
        operation: 'patch',
        commandId: 'work-state-bypass',
        workItemId: created.workItemId,
        expectedVersion: 2,
        patch: { state: 'running' } as never,
      }),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_ARGUMENT' }));
    expect(() =>
      service.updateWorkItem({
        operation: 'patch',
        commandId: 'work-stale',
        workItemId: created.workItemId,
        expectedVersion: 1,
        patch: { title: 'Stale' },
      }),
    ).toThrowError(expect.objectContaining({ code: 'VERSION_CONFLICT' }));
  });

  it('persists exactly the PH-01 legal transition matrix', async () => {
    const { service, repositories } = await stateRuntime();
    seedRun(repositories);
    const states: WorkItemState[] = [
      'ready',
      'running',
      'verifying',
      'needs_decision',
      'needs_review',
      'blocked',
      'done',
      'cancelled',
    ];
    const legal: Record<WorkItemState, WorkItemState[]> = {
      ready: ['running', 'cancelled'],
      running: [
        'verifying',
        'needs_decision',
        'needs_review',
        'blocked',
        'cancelled',
      ],
      verifying: [
        'running',
        'needs_decision',
        'needs_review',
        'blocked',
        'done',
        'cancelled',
      ],
      needs_decision: ['ready', 'running', 'blocked', 'cancelled'],
      needs_review: ['running', 'verifying', 'blocked', 'done', 'cancelled'],
      blocked: ['ready', 'running', 'cancelled'],
      done: [],
      cancelled: [],
    };

    for (const from of states) {
      for (const to of states) {
        const suffix = `${from}-${to}`;
        const workItemId = `work-${suffix}`;
        repositories.putWorkItem({
          workItemId,
          runId: 'run-1',
          title: suffix,
          objective: suffix,
          state: from,
          risk: 'low',
          acceptance: {
            requiredLevel: 'implemented',
            criteria: ['implemented'],
            requiredEvidenceKinds: ['manual'],
          },
          readinessLevel: 'implemented',
          readinessEvidenceIds: [],
          version: 1,
          createdAt: at,
          updatedAt: at,
        });
        const evidenceId = `evidence-${suffix}`;
        repositories.putEvidence({
          evidenceId,
          runId: 'run-1',
          workItemId,
          kind: 'manual',
          summary: 'verified',
          status: 'pass',
          createdAt: at,
        });
        const transition = () =>
          service.transitionWorkItem({
            commandId: `transition-${suffix}`,
            workItemId,
            expectedVersion: 1,
            to,
            ...(to === 'done'
              ? {
                  completion: {
                    achievedLevel: 'implemented' as const,
                    evidenceIds: [evidenceId],
                  },
                }
              : {}),
          });

        if (legal[from].includes(to)) expect(transition().state).toBe(to);
        else
          expect(transition).toThrowError(
            expect.objectContaining({ code: 'INVALID_TRANSITION' }),
          );
      }
    }
  });

  it.each([
    ['readiness', 'validated_target', []],
    ['missing-kind', 'implemented', []],
    ['missing-reference', 'implemented', ['missing']],
  ] as const)(
    'blocks incomplete completion: %s',
    async (_case, requiredLevel, evidenceIds) => {
      const { service, repositories } = await stateRuntime();
      seedRun(repositories);
      repositories.putWorkItem({
        workItemId: 'work-1',
        runId: 'run-1',
        title: 'work',
        objective: 'work',
        state: 'verifying',
        risk: 'high',
        acceptance: {
          requiredLevel,
          criteria: ['complete'],
          requiredEvidenceKinds: ['test'],
        },
        readinessLevel: 'implemented',
        readinessEvidenceIds: [],
        version: 1,
        createdAt: at,
        updatedAt: at,
      });

      expect(() =>
        service.transitionWorkItem({
          commandId: `complete-${_case}`,
          workItemId: 'work-1',
          expectedVersion: 1,
          to: 'done',
          completion: {
            achievedLevel: 'implemented',
            evidenceIds: [...evidenceIds],
          },
        }),
      ).toThrowError(expect.objectContaining({ code: 'COMPLETION_BLOCKED' }));
    },
  );

  it.each(['fail', 'partial', 'unknown'] as const)(
    'does not count %s evidence toward completion',
    async (status) => {
      const { service, repositories } = await stateRuntime();
      seedRun(repositories);
      repositories.putWorkItem({
        workItemId: 'work-1',
        runId: 'run-1',
        title: 'work',
        objective: 'work',
        state: 'verifying',
        risk: 'high',
        acceptance: {
          requiredLevel: 'implemented',
          criteria: ['complete'],
          requiredEvidenceKinds: ['test'],
        },
        readinessLevel: 'implemented',
        readinessEvidenceIds: [],
        version: 1,
        createdAt: at,
        updatedAt: at,
      });
      repositories.putEvidence({
        evidenceId: 'evidence-1',
        runId: 'run-1',
        workItemId: 'work-1',
        kind: 'test',
        summary: status,
        status,
        createdAt: at,
      });
      expect(() =>
        service.transitionWorkItem({
          commandId: `complete-${status}`,
          workItemId: 'work-1',
          expectedVersion: 1,
          to: 'done',
          completion: {
            achievedLevel: 'implemented',
            evidenceIds: ['evidence-1'],
          },
        }),
      ).toThrowError(expect.objectContaining({ code: 'COMPLETION_BLOCKED' }));
    },
  );

  it.each([undefined, 'work-1'] as const)(
    'blocks completion with a pending %s decision',
    async (decisionWorkItemId) => {
      const { service, repositories } = await stateRuntime();
      seedRun(repositories);
      repositories.putWorkItem({
        workItemId: 'work-1',
        runId: 'run-1',
        title: 'work',
        objective: 'work',
        state: 'verifying',
        risk: 'high',
        acceptance: {
          requiredLevel: 'implemented',
          criteria: ['complete'],
          requiredEvidenceKinds: ['test'],
        },
        readinessLevel: 'implemented',
        readinessEvidenceIds: [],
        version: 1,
        createdAt: at,
        updatedAt: at,
      });
      repositories.putEvidence({
        evidenceId: 'evidence-1',
        runId: 'run-1',
        workItemId: 'work-1',
        kind: 'test',
        summary: 'pass',
        status: 'pass',
        createdAt: at,
      });
      repositories.putDecision({
        decisionId: 'decision-1',
        runId: 'run-1',
        ...(decisionWorkItemId ? { workItemId: decisionWorkItemId } : {}),
        question: 'pending?',
        status: 'pending',
        authority: 'main',
        version: 1,
        createdAt: at,
        updatedAt: at,
      });

      expect(() =>
        service.transitionWorkItem({
          commandId: `complete-decision-${decisionWorkItemId ?? 'run'}`,
          workItemId: 'work-1',
          expectedVersion: 1,
          to: 'done',
          completion: {
            achievedLevel: 'implemented',
            evidenceIds: ['evidence-1'],
          },
        }),
      ).toThrowError(expect.objectContaining({ code: 'COMPLETION_BLOCKED' }));
    },
  );

  it('completes only with passing evidence and no pending decision', async () => {
    const { service, repositories } = await stateRuntime();
    seedRun(repositories);
    repositories.putWorkItem({
      workItemId: 'work-1',
      runId: 'run-1',
      title: 'work',
      objective: 'work',
      state: 'verifying',
      risk: 'high',
      acceptance: {
        requiredLevel: 'validated_local',
        criteria: ['complete'],
        requiredEvidenceKinds: ['test'],
      },
      readinessLevel: 'implemented',
      readinessEvidenceIds: [],
      version: 1,
      createdAt: at,
      updatedAt: at,
    });
    repositories.putEvidence({
      evidenceId: 'evidence-1',
      runId: 'run-1',
      workItemId: 'work-1',
      kind: 'test',
      summary: 'pass',
      status: 'pass',
      createdAt: at,
    });

    expect(
      service.transitionWorkItem({
        commandId: 'complete-pass',
        workItemId: 'work-1',
        expectedVersion: 1,
        to: 'done',
        completion: {
          achievedLevel: 'validated_local',
          evidenceIds: ['evidence-1'],
        },
      }),
    ).toMatchObject({
      state: 'done',
      readinessLevel: 'validated_local',
      readinessEvidenceIds: ['evidence-1'],
      version: 2,
    });
  });

  it('rolls entity, event and receipt back when event append fails', async () => {
    let fail = true;
    const { service, repositories, db } = await stateRuntime(() => {
      if (fail) throw new Error('event fault');
    });
    seedRun(repositories);
    repositories.putWorkItem({
      workItemId: 'work-1',
      runId: 'run-1',
      title: 'before',
      objective: 'work',
      state: 'ready',
      risk: 'low',
      acceptance: {
        requiredLevel: 'implemented',
        criteria: ['complete'],
        requiredEvidenceKinds: [],
      },
      readinessLevel: 'implemented',
      readinessEvidenceIds: [],
      version: 1,
      createdAt: at,
      updatedAt: at,
    });

    expect(() =>
      service.updateWorkItem({
        operation: 'patch',
        commandId: 'fault',
        workItemId: 'work-1',
        expectedVersion: 1,
        patch: { title: 'after' },
      }),
    ).toThrow('event fault');
    expect(repositories.getWorkItem('work-1')).toMatchObject({
      title: 'before',
      version: 1,
    });
    expect(repositories.listEvents('run-1')).toEqual([]);
    expect(
      db.prepare('SELECT count(*) AS count FROM command_receipts').get(),
    ).toEqual({ count: 0 });

    fail = false;
    expect(
      service.updateWorkItem({
        operation: 'patch',
        commandId: 'fault',
        workItemId: 'work-1',
        expectedVersion: 1,
        patch: { title: 'after' },
      }),
    ).toMatchObject({ title: 'after', version: 2 });
  });

  it('records and resolves decisions, redacts evidence, and projects a summary', async () => {
    const { service, pluginData, db } = await stateRuntime();
    const run = await service.beginWorkflow({
      commandId: 'begin-projection',
      projectRoot: pluginData,
      objective: 'Projection',
      durable: false,
    });
    const work = service.updateWorkItem({
      operation: 'create',
      commandId: 'create-projection',
      runId: run.runId,
      title: 'Projected work',
      objective: 'Projection',
      risk: 'medium',
      acceptance: {
        requiredLevel: 'validated_local',
        criteria: ['validated'],
        requiredEvidenceKinds: ['test'],
      },
    });
    const decisionInput = {
      commandId: 'decision-projection',
      runId: run.runId,
      workItemId: work.workItemId,
      question: 'Proceed?',
      authority: 'main' as const,
    };
    const decision = service.requestDecision(decisionInput);
    expect(service.requestDecision(decisionInput)).toEqual(decision);
    expect(
      service.resolveDecision({
        commandId: 'resolve-projection',
        decisionId: decision.decisionId,
        expectedVersion: 1,
        resolution: 'Proceed',
      }),
    ).toMatchObject({ status: 'resolved', version: 2 });
    const evidence = service.recordEvidence({
      commandId: 'evidence-projection',
      runId: run.runId,
      workItemId: work.workItemId,
      kind: 'test',
      summary: 'passed token=secret-value',
      status: 'pass',
      command: 'Authorization: Bearer private-value',
      sourceUri:
        'https://user:source-password@example.com/report?token=source-secret',
    });
    expect(evidence.summary).toBe('passed token=[REDACTED]');
    expect(evidence.command).toBe('Authorization: Bearer [REDACTED]');
    expect(evidence.sourceUri).toBe('https://example.com/report');
    const persisted = JSON.stringify({
      evidence: db
        .prepare(
          'SELECT summary, source_uri, command FROM evidence WHERE evidence_id = ?',
        )
        .get(evidence.evidenceId),
      receipt: db
        .prepare(
          'SELECT result_json FROM command_receipts WHERE command_id = ?',
        )
        .get('evidence-projection'),
    });
    expect(persisted).not.toContain('secret-value');
    expect(persisted).not.toContain('private-value');
    expect(persisted).not.toContain('source-password');
    expect(persisted).not.toContain('source-secret');
    expect(service.getWorkItem(work.workItemId)).toMatchObject({
      evidenceRefs: [{ evidenceId: evidence.evidenceId }],
      pendingDecisions: [],
    });

    const summary = await service.getWorkflowSummary({
      projectRoot: pluginData,
    });
    expect(summary).toMatchObject({
      run: { runId: run.runId },
      activeWork: [{ workItemId: work.workItemId, liveness: 'unknown' }],
      evidenceRefs: [{ evidenceId: evidence.evidenceId }],
      nextSafeAction: 'inspect_repo_drift',
    });
  });

  it('does not persist raw secrets from flags, structured text, headers, or URI userinfo', async () => {
    const { service, pluginData, db } = await stateRuntime();
    const run = await service.beginWorkflow({
      commandId: 'begin-secret-regression',
      projectRoot: pluginData,
      objective: 'Secret regression',
      durable: false,
    });
    const evidence = service.recordEvidence({
      commandId: 'evidence-secret-regression',
      runId: run.runId,
      kind: 'test',
      summary:
        '--token flag-secret {"token":"json-secret"} X-Api-Key: header-secret client_secret=client-secret access_token=access-secret api_key=api-secret password=password-secret secret=secret-value token=plain-token-secret',
      status: 'pass',
      command:
        'Authorization: Basic basic-secret Authorization: Bearer bearer-secret',
      sourceUri:
        'https://user:uri-secret@example.com/report?token=query-secret&access_token=query-access-secret',
    });
    const persisted = JSON.stringify({
      evidence: db
        .prepare(
          'SELECT summary, source_uri, command FROM evidence WHERE evidence_id = ?',
        )
        .get(evidence.evidenceId),
      receipt: db
        .prepare(
          'SELECT result_json FROM command_receipts WHERE command_id = ?',
        )
        .get('evidence-secret-regression'),
    });

    for (const secret of [
      'flag-secret',
      'json-secret',
      'header-secret',
      'client-secret',
      'access-secret',
      'api-secret',
      'password-secret',
      'secret-value',
      'plain-token-secret',
      'basic-secret',
      'bearer-secret',
      'uri-secret',
      'query-secret',
      'query-access-secret',
    ]) {
      expect(persisted).not.toContain(secret);
    }
  });
});
