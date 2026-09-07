import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildReconciliationProjection,
  classifyRepoDrift,
  migrateDatabase,
  openWorkflowDatabase,
  resolveStorageRoot,
  StateRepositories,
} from '../../src/state/index.js';

const at = '2026-09-08T00:00:00Z';
let pluginData: string;
let db: DatabaseSync;
let repositories: StateRepositories;

beforeEach(async () => {
  pluginData = await mkdtemp(path.join(tmpdir(), 'workflow-next-reconcile-'));
  const storage = resolveStorageRoot(pluginData);
  db = openWorkflowDatabase(storage);
  await migrateDatabase(db, storage);
  repositories = new StateRepositories(db);
});

afterEach(async () => {
  if (db.isOpen) db.close();
  await rm(pluginData, { recursive: true });
});

const project = {
  projectId: 'project-1',
  repoRoot: '/repo',
  repoKey: 'key',
  repoFingerprint: 'fingerprint',
  createdAt: at,
  updatedAt: at,
  version: 1,
};
const run = {
  runId: 'run-1',
  projectId: 'project-1',
  objective: 'recover',
  state: 'active' as const,
  durable: false,
  lastObservedRepoHead: 'head-1',
  startedAt: at,
  updatedAt: at,
  version: 1,
};
const inspection = {
  repoRoot: '/repo',
  repoKey: 'key',
  repoFingerprint: 'fingerprint',
  gitAvailable: true,
  head: 'head-1',
};

describe('repository drift classification', () => {
  it('distinguishes same HEAD, changed HEAD, identity drift and unavailable Git', () => {
    expect(classifyRepoDrift(project, run, inspection)).toBe('none');
    expect(
      classifyRepoDrift(project, run, { ...inspection, head: 'head-2' }),
    ).toBe('head_changed');
    expect(
      classifyRepoDrift(project, run, {
        ...inspection,
        repoFingerprint: 'different',
      }),
    ).toBe('project_identity_changed');
    expect(
      classifyRepoDrift(project, run, { ...inspection, gitAvailable: false }),
    ).toBe('git_unavailable');
  });
});

describe('reconciliation projection', () => {
  beforeEach(() => {
    repositories.putProject(project);
    repositories.putRun(run);
    repositories.putWorkItem({
      workItemId: 'work-1',
      runId: 'run-1',
      title: 'running work',
      objective: 'recover',
      state: 'running',
      risk: 'medium',
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
  });

  it('labels persisted running work liveness unknown', () => {
    expect(
      buildReconciliationProjection({ project, run, inspection, repositories }),
    ).toMatchObject({
      activeWork: [{ workItemId: 'work-1', liveness: 'unknown' }],
      nextSafeAction: 'reconcile_active_work',
    });
  });

  it('prioritizes repo drift over pending decisions and decisions over resume', () => {
    repositories.putDecision({
      decisionId: 'decision-1',
      runId: 'run-1',
      question: 'continue?',
      status: 'pending',
      authority: 'user',
      version: 1,
      createdAt: at,
      updatedAt: at,
    });
    expect(
      buildReconciliationProjection({ project, run, inspection, repositories })
        .nextSafeAction,
    ).toBe('resolve_decision');
    expect(
      buildReconciliationProjection({
        project,
        run,
        inspection: { ...inspection, head: 'changed' },
        repositories,
      }).nextSafeAction,
    ).toBe('inspect_repo_drift');
  });

  it('surfaces cleanup before none and starts when no run is persisted', () => {
    repositories.putResource({
      resourceId: 'resource-1',
      runId: 'run-1',
      type: 'worktree',
      control: 'coordinated',
      owner: 'main',
      nativeRef: 'worktree-1',
      status: 'completed',
      cleanupRequired: true,
      version: 1,
      createdAt: at,
      updatedAt: at,
    });
    repositories.setWorkItemState('work-1', 1, 'cancelled', at);
    expect(
      buildReconciliationProjection({ project, run, inspection, repositories })
        .nextSafeAction,
    ).toBe('inspect_cleanup');
    expect(buildReconciliationProjection({ repositories }).nextSafeAction).toBe(
      'start_run',
    );
  });
});
