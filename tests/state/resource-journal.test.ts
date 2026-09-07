import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  migrateDatabase,
  openWorkflowDatabase,
  RunResourceJournal,
  resolveStorageRoot,
  StateRepositories,
} from '../../src/state/index.js';

const at = '2026-09-08T00:00:00Z';
let pluginData: string;
let db: DatabaseSync;
let repositories: StateRepositories;
let journal: RunResourceJournal;

beforeEach(async () => {
  pluginData = await mkdtemp(path.join(tmpdir(), 'workflow-next-resource-'));
  const storage = resolveStorageRoot(pluginData);
  db = openWorkflowDatabase(storage);
  await migrateDatabase(db, storage);
  repositories = new StateRepositories(db);
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
    objective: 'resources',
    state: 'active',
    durable: false,
    startedAt: at,
    updatedAt: at,
    version: 1,
  });
  journal = new RunResourceJournal({
    db,
    repositories,
    clock: { nowIso: () => at },
  });
});

afterEach(async () => {
  if (db.isOpen) db.close();
  await rm(pluginData, { recursive: true });
});

describe('RunResourceJournal', () => {
  it('records an idempotent coordinated lifecycle and one event per mutation', () => {
    const intentInput = {
      commandId: 'intent-1',
      runId: 'run-1',
      type: 'worktree' as const,
      owner: 'main',
      cleanupRequired: true,
    };
    const intent = journal.recordIntent(intentInput);
    expect(journal.recordIntent(intentInput)).toEqual(intent);
    const attached = journal.attach({
      commandId: 'attach-1',
      resourceId: intent.resourceId,
      expectedVersion: 1,
      nativeRef: 'worktree-1',
    });
    const running = journal.transition({
      commandId: 'running-1',
      resourceId: intent.resourceId,
      expectedVersion: 2,
      to: 'running',
    });
    const completed = journal.transition({
      commandId: 'completed-1',
      resourceId: intent.resourceId,
      expectedVersion: 3,
      to: 'completed',
    });

    expect([
      intent.status,
      attached.status,
      running.status,
      completed.status,
    ]).toEqual(['intent_recorded', 'attached', 'running', 'completed']);
    expect(repositories.listEvents('run-1')).toHaveLength(4);
  });

  it('supports intent failure and enforces optimistic versions', () => {
    const intent = journal.recordIntent({
      commandId: 'intent-fail',
      runId: 'run-1',
      type: 'tool_session',
      owner: 'main',
      cleanupRequired: false,
    });
    expect(
      journal.transition({
        commandId: 'failed',
        resourceId: intent.resourceId,
        expectedVersion: 1,
        to: 'failed',
        error: 'token=secret-value',
      }),
    ).toMatchObject({
      status: 'failed',
      lastError: 'token=[REDACTED]',
      version: 2,
    });
    expect(() =>
      journal.transition({
        commandId: 'stale',
        resourceId: intent.resourceId,
        expectedVersion: 1,
        to: 'cleaned',
      }),
    ).toThrowError(expect.objectContaining({ code: 'VERSION_CONFLICT' }));
  });

  it('records observed ownership truthfully and rejects cleanup ownership', () => {
    const observed = journal.observe({
      commandId: 'observe-1',
      runId: 'run-1',
      type: 'agent_thread',
      owner: 'native',
      nativeRef: 'thread-1',
    });
    expect(observed).toMatchObject({
      control: 'observed',
      status: 'observed',
      cleanupRequired: false,
    });
    expect(() =>
      journal.observe({
        commandId: 'observe-invalid',
        runId: 'run-1',
        type: 'agent_thread',
        owner: 'native',
        nativeRef: 'thread-2',
        cleanupRequired: true,
      } as never),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_ARGUMENT' }));
  });

  it('requires native attachment before running and clears cleanup on cleaned', () => {
    const intent = journal.recordIntent({
      commandId: 'intent-clean',
      runId: 'run-1',
      type: 'worktree',
      owner: 'main',
      cleanupRequired: true,
    });
    expect(() =>
      journal.transition({
        commandId: 'running-without-ref',
        resourceId: intent.resourceId,
        expectedVersion: 1,
        to: 'running',
      }),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_TRANSITION' }));
    const attached = journal.attach({
      commandId: 'attach-clean',
      resourceId: intent.resourceId,
      expectedVersion: 1,
      nativeRef: 'worktree-1',
    });
    const cleaned = journal.transition({
      commandId: 'cleaned',
      resourceId: attached.resourceId,
      expectedVersion: 2,
      to: 'cleaned',
    });
    expect(cleaned).toMatchObject({
      status: 'cleaned',
      cleanupRequired: false,
    });
  });
});
