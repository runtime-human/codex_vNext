import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';

import type {
  AcceptanceSpec,
  AgentRole,
  EvidenceKind,
  ReadinessLevel,
  WorkItemState,
} from '../domain/index.js';
import { canonicalJson } from './canonical-json.js';
import { StateError } from './errors.js';

type RunState = 'active' | 'paused' | 'blocked' | 'completed' | 'cancelled';
type Risk = 'low' | 'medium' | 'high' | 'critical';
type EvidenceStatus = 'pass' | 'fail' | 'partial' | 'unknown';
type DecisionStatus = 'pending' | 'resolved' | 'superseded';
type DecisionAuthority = 'main' | 'user';
type ResourceType =
  | 'agent_thread'
  | 'worktree'
  | 'temporary_branch'
  | 'tool_session'
  | 'test_run'
  | 'other';
type ResourceControl = 'coordinated' | 'observed';
type ResourceStatus =
  | 'intent_recorded'
  | 'observed'
  | 'attached'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cleaned';
type EventEntity =
  | 'run'
  | 'work_item'
  | 'decision'
  | 'evidence'
  | 'resource'
  | 'artifact';

export interface ProjectRecord {
  projectId: string;
  repoRoot: string;
  repoKey: string;
  repoFingerprint: string;
  remoteUrl?: string;
  defaultBranch?: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface RunRecord {
  runId: string;
  projectId: string;
  objective: string;
  state: RunState;
  durable: boolean;
  primaryThreadId?: string;
  repoHeadAtStart?: string;
  lastObservedRepoHead?: string;
  startedAt: string;
  updatedAt: string;
  version: number;
}

export interface WorkItemRecord {
  workItemId: string;
  runId: string;
  title: string;
  objective: string;
  state: WorkItemState;
  risk: Risk;
  ownerRole?: AgentRole;
  nativeThreadId?: string;
  worktreeRef?: string;
  acceptance: AcceptanceSpec;
  readinessLevel: ReadinessLevel;
  readinessEvidenceIds: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorkItemPatch {
  title?: string;
  objective?: string;
  risk?: Risk;
  ownerRole?: AgentRole | null;
  nativeThreadId?: string | null;
  worktreeRef?: string | null;
  acceptance?: AcceptanceSpec;
}

export interface DecisionRecord {
  decisionId: string;
  runId: string;
  workItemId?: string;
  question: string;
  alternatives?: unknown[];
  recommendation?: string;
  status: DecisionStatus;
  authority: DecisionAuthority;
  resolution?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface EvidenceRecord {
  evidenceId: string;
  runId: string;
  workItemId?: string;
  kind: EvidenceKind;
  summary: string;
  status: EvidenceStatus;
  sourceUri?: string;
  command?: string;
  exitCode?: number;
  gitSha?: string;
  artifactId?: string;
  createdAt: string;
}

export interface ArtifactRecord {
  artifactId: string;
  sha256: string;
  byteSize: number;
  mediaType: string;
  relativePath: string;
  preview?: string;
  createdAt: string;
}

export interface ResourceRecord {
  resourceId: string;
  runId: string;
  workItemId?: string;
  type: ResourceType;
  control: ResourceControl;
  owner: string;
  nativeRef?: string;
  status: ResourceStatus;
  cleanupRequired: boolean;
  lastError?: string;
  evidenceId?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowEventRecord {
  sequence?: number;
  eventId: string;
  runId: string;
  entityType: EventEntity;
  entityId: string;
  eventType: string;
  payload: unknown;
  commandId?: string;
  createdAt: string;
}

type Row = Record<string, SQLOutputValue>;

function text(row: Row, key: string): string {
  return row[key] as string;
}

function optionalText(row: Row, key: string): string | undefined {
  return (row[key] as string | null) ?? undefined;
}

function number(row: Row, key: string): number {
  return row[key] as number;
}

function projectFromRow(row: Row): ProjectRecord {
  return {
    projectId: text(row, 'project_id'),
    repoRoot: text(row, 'repo_root'),
    repoKey: text(row, 'repo_key'),
    repoFingerprint: text(row, 'repo_fingerprint'),
    ...(optionalText(row, 'remote_url')
      ? { remoteUrl: text(row, 'remote_url') }
      : {}),
    ...(optionalText(row, 'default_branch')
      ? { defaultBranch: text(row, 'default_branch') }
      : {}),
    createdAt: text(row, 'created_at'),
    updatedAt: text(row, 'updated_at'),
    version: number(row, 'version'),
  };
}

function runFromRow(row: Row): RunRecord {
  return {
    runId: text(row, 'run_id'),
    projectId: text(row, 'project_id'),
    objective: text(row, 'objective'),
    state: text(row, 'state') as RunState,
    durable: number(row, 'durable') === 1,
    ...(optionalText(row, 'primary_thread_id')
      ? { primaryThreadId: text(row, 'primary_thread_id') }
      : {}),
    ...(optionalText(row, 'repo_head_at_start')
      ? { repoHeadAtStart: text(row, 'repo_head_at_start') }
      : {}),
    ...(optionalText(row, 'last_observed_repo_head')
      ? { lastObservedRepoHead: text(row, 'last_observed_repo_head') }
      : {}),
    startedAt: text(row, 'started_at'),
    updatedAt: text(row, 'updated_at'),
    version: number(row, 'version'),
  };
}

function workItemFromRow(row: Row): WorkItemRecord {
  return {
    workItemId: text(row, 'work_item_id'),
    runId: text(row, 'run_id'),
    title: text(row, 'title'),
    objective: text(row, 'objective'),
    state: text(row, 'state') as WorkItemState,
    risk: text(row, 'risk') as Risk,
    ...(optionalText(row, 'owner_role')
      ? { ownerRole: text(row, 'owner_role') as AgentRole }
      : {}),
    ...(optionalText(row, 'native_thread_id')
      ? { nativeThreadId: text(row, 'native_thread_id') }
      : {}),
    ...(optionalText(row, 'worktree_ref')
      ? { worktreeRef: text(row, 'worktree_ref') }
      : {}),
    acceptance: JSON.parse(text(row, 'acceptance_json')) as AcceptanceSpec,
    readinessLevel: text(row, 'readiness_level') as ReadinessLevel,
    readinessEvidenceIds: JSON.parse(
      text(row, 'readiness_evidence_json'),
    ) as string[],
    version: number(row, 'version'),
    createdAt: text(row, 'created_at'),
    updatedAt: text(row, 'updated_at'),
  };
}

function decisionFromRow(row: Row): DecisionRecord {
  const alternatives = optionalText(row, 'alternatives_json');
  return {
    decisionId: text(row, 'decision_id'),
    runId: text(row, 'run_id'),
    ...(optionalText(row, 'work_item_id')
      ? { workItemId: text(row, 'work_item_id') }
      : {}),
    question: text(row, 'question'),
    ...(alternatives
      ? { alternatives: JSON.parse(alternatives) as unknown[] }
      : {}),
    ...(optionalText(row, 'recommendation')
      ? { recommendation: text(row, 'recommendation') }
      : {}),
    status: text(row, 'status') as DecisionStatus,
    authority: text(row, 'authority') as DecisionAuthority,
    ...(optionalText(row, 'resolution')
      ? { resolution: text(row, 'resolution') }
      : {}),
    version: number(row, 'version'),
    createdAt: text(row, 'created_at'),
    updatedAt: text(row, 'updated_at'),
  };
}

function evidenceFromRow(row: Row): EvidenceRecord {
  return {
    evidenceId: text(row, 'evidence_id'),
    runId: text(row, 'run_id'),
    ...(optionalText(row, 'work_item_id')
      ? { workItemId: text(row, 'work_item_id') }
      : {}),
    kind: text(row, 'kind') as EvidenceKind,
    summary: text(row, 'summary'),
    status: text(row, 'status') as EvidenceStatus,
    ...(optionalText(row, 'source_uri')
      ? { sourceUri: text(row, 'source_uri') }
      : {}),
    ...(optionalText(row, 'command') ? { command: text(row, 'command') } : {}),
    ...(row.exit_code !== null ? { exitCode: number(row, 'exit_code') } : {}),
    ...(optionalText(row, 'git_sha') ? { gitSha: text(row, 'git_sha') } : {}),
    ...(optionalText(row, 'artifact_id')
      ? { artifactId: text(row, 'artifact_id') }
      : {}),
    createdAt: text(row, 'created_at'),
  };
}

function artifactFromRow(row: Row): ArtifactRecord {
  return {
    artifactId: text(row, 'artifact_id'),
    sha256: text(row, 'sha256'),
    byteSize: number(row, 'byte_size'),
    mediaType: text(row, 'media_type'),
    relativePath: text(row, 'relative_path'),
    ...(optionalText(row, 'preview') ? { preview: text(row, 'preview') } : {}),
    createdAt: text(row, 'created_at'),
  };
}

function resourceFromRow(row: Row): ResourceRecord {
  return {
    resourceId: text(row, 'resource_id'),
    runId: text(row, 'run_id'),
    ...(optionalText(row, 'work_item_id')
      ? { workItemId: text(row, 'work_item_id') }
      : {}),
    type: text(row, 'type') as ResourceType,
    control: text(row, 'control') as ResourceControl,
    owner: text(row, 'owner'),
    ...(optionalText(row, 'native_ref')
      ? { nativeRef: text(row, 'native_ref') }
      : {}),
    status: text(row, 'status') as ResourceStatus,
    cleanupRequired: number(row, 'cleanup_required') === 1,
    ...(optionalText(row, 'last_error')
      ? { lastError: text(row, 'last_error') }
      : {}),
    ...(optionalText(row, 'evidence_id')
      ? { evidenceId: text(row, 'evidence_id') }
      : {}),
    version: number(row, 'version'),
    createdAt: text(row, 'created_at'),
    updatedAt: text(row, 'updated_at'),
  };
}

function eventFromRow(row: Row): WorkflowEventRecord {
  return {
    sequence: number(row, 'sequence'),
    eventId: text(row, 'event_id'),
    runId: text(row, 'run_id'),
    entityType: text(row, 'entity_type') as EventEntity,
    entityId: text(row, 'entity_id'),
    eventType: text(row, 'event_type'),
    payload: JSON.parse(text(row, 'payload_json')),
    ...(optionalText(row, 'command_id')
      ? { commandId: text(row, 'command_id') }
      : {}),
    createdAt: text(row, 'created_at'),
  };
}

export class StateRepositories {
  constructor(readonly db: DatabaseSync) {}

  putProject(value: ProjectRecord): void {
    this.db
      .prepare(`INSERT INTO projects (
      project_id, repo_root, repo_key, repo_fingerprint, remote_url, default_branch,
      created_at, updated_at, version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        value.projectId,
        value.repoRoot,
        value.repoKey,
        value.repoFingerprint,
        value.remoteUrl ?? null,
        value.defaultBranch ?? null,
        value.createdAt,
        value.updatedAt,
        value.version,
      );
  }

  getProject(projectId: string): ProjectRecord | undefined {
    const row = this.db
      .prepare('SELECT * FROM projects WHERE project_id = ?')
      .get(projectId) as Row | undefined;
    return row ? projectFromRow(row) : undefined;
  }

  getProjectByRepoKey(repoKey: string): ProjectRecord | undefined {
    const row = this.db
      .prepare('SELECT * FROM projects WHERE repo_key = ?')
      .get(repoKey) as Row | undefined;
    return row ? projectFromRow(row) : undefined;
  }

  updateProjectInspection(
    projectId: string,
    inspection: Pick<
      ProjectRecord,
      'repoRoot' | 'repoFingerprint' | 'remoteUrl' | 'defaultBranch'
    >,
    updatedAt: string,
  ): ProjectRecord {
    this.db
      .prepare(`UPDATE projects SET
        repo_root = ?, repo_fingerprint = ?, remote_url = ?, default_branch = ?,
        updated_at = ?, version = version + 1
        WHERE project_id = ?`)
      .run(
        inspection.repoRoot,
        inspection.repoFingerprint,
        inspection.remoteUrl ?? null,
        inspection.defaultBranch ?? null,
        updatedAt,
        projectId,
      );
    return this.getProject(projectId) as ProjectRecord;
  }

  putRun(value: RunRecord): void {
    this.db
      .prepare(`INSERT INTO runs (
      run_id, project_id, objective, state, durable, primary_thread_id,
      repo_head_at_start, last_observed_repo_head, started_at, updated_at, version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        value.runId,
        value.projectId,
        value.objective,
        value.state,
        value.durable ? 1 : 0,
        value.primaryThreadId ?? null,
        value.repoHeadAtStart ?? null,
        value.lastObservedRepoHead ?? null,
        value.startedAt,
        value.updatedAt,
        value.version,
      );
  }

  getRun(runId: string): RunRecord | undefined {
    const row = this.db
      .prepare('SELECT * FROM runs WHERE run_id = ?')
      .get(runId) as Row | undefined;
    return row ? runFromRow(row) : undefined;
  }

  getLatestRunForProject(projectId: string): RunRecord | undefined {
    const row = this.db
      .prepare(
        'SELECT * FROM runs WHERE project_id = ? ORDER BY updated_at DESC LIMIT 1',
      )
      .get(projectId) as Row | undefined;
    return row ? runFromRow(row) : undefined;
  }

  putWorkItem(value: WorkItemRecord): void {
    this.db
      .prepare(`INSERT INTO work_items (
      work_item_id, run_id, title, objective, state, risk, owner_role,
      native_thread_id, worktree_ref, acceptance_json, readiness_level,
      readiness_evidence_json, version, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        value.workItemId,
        value.runId,
        value.title,
        value.objective,
        value.state,
        value.risk,
        value.ownerRole ?? null,
        value.nativeThreadId ?? null,
        value.worktreeRef ?? null,
        canonicalJson(value.acceptance),
        value.readinessLevel,
        canonicalJson(value.readinessEvidenceIds),
        value.version,
        value.createdAt,
        value.updatedAt,
      );
  }

  getWorkItem(workItemId: string): WorkItemRecord | undefined {
    const row = this.db
      .prepare('SELECT * FROM work_items WHERE work_item_id = ?')
      .get(workItemId) as Row | undefined;
    return row ? workItemFromRow(row) : undefined;
  }

  updateWorkItem(
    workItemId: string,
    expectedVersion: number,
    patch: WorkItemPatch,
    updatedAt: string,
  ): WorkItemRecord {
    const columns: string[] = [];
    const values: (string | null)[] = [];
    const add = (column: string, value: string | null) => {
      columns.push(`${column} = ?`);
      values.push(value);
    };
    if (patch.title !== undefined) add('title', patch.title);
    if (patch.objective !== undefined) add('objective', patch.objective);
    if (patch.risk !== undefined) add('risk', patch.risk);
    if (patch.ownerRole !== undefined) add('owner_role', patch.ownerRole);
    if (patch.nativeThreadId !== undefined)
      add('native_thread_id', patch.nativeThreadId);
    if (patch.worktreeRef !== undefined) add('worktree_ref', patch.worktreeRef);
    if (patch.acceptance !== undefined)
      add('acceptance_json', canonicalJson(patch.acceptance));
    add('updated_at', updatedAt);
    columns.push('version = version + 1');

    const result = this.db
      .prepare(
        `UPDATE work_items SET ${columns.join(', ')} WHERE work_item_id = ? AND version = ?`,
      )
      .run(...values, workItemId, expectedVersion);
    if (Number(result.changes) === 0) {
      if (!this.getWorkItem(workItemId))
        throw new StateError('NOT_FOUND', 'work item not found');
      throw new StateError(
        'VERSION_CONFLICT',
        'work item version does not match',
        {
          expectedVersion,
        },
      );
    }
    return this.getWorkItem(workItemId) as WorkItemRecord;
  }

  setWorkItemState(
    workItemId: string,
    expectedVersion: number,
    state: WorkItemState,
    updatedAt: string,
    completion?: { readinessLevel: ReadinessLevel; evidenceIds: string[] },
  ): WorkItemRecord {
    const result = completion
      ? this.db
          .prepare(`UPDATE work_items SET
            state = ?, readiness_level = ?, readiness_evidence_json = ?,
            updated_at = ?, version = version + 1
            WHERE work_item_id = ? AND version = ?`)
          .run(
            state,
            completion.readinessLevel,
            canonicalJson(completion.evidenceIds),
            updatedAt,
            workItemId,
            expectedVersion,
          )
      : this.db
          .prepare(`UPDATE work_items SET
            state = ?, updated_at = ?, version = version + 1
            WHERE work_item_id = ? AND version = ?`)
          .run(state, updatedAt, workItemId, expectedVersion);
    if (Number(result.changes) === 0) {
      if (!this.getWorkItem(workItemId))
        throw new StateError('NOT_FOUND', 'work item not found');
      throw new StateError(
        'VERSION_CONFLICT',
        'work item version does not match',
        {
          expectedVersion,
        },
      );
    }
    return this.getWorkItem(workItemId) as WorkItemRecord;
  }

  listWorkItems(runId: string, limit = -1): WorkItemRecord[] {
    return (
      this.db
        .prepare(
          'SELECT * FROM work_items WHERE run_id = ? ORDER BY created_at, work_item_id LIMIT ?',
        )
        .all(runId, limit) as Row[]
    ).map(workItemFromRow);
  }

  listActiveWorkItems(runId: string, limit = -1): WorkItemRecord[] {
    return (
      this.db
        .prepare(`SELECT * FROM work_items
          WHERE run_id = ? AND state NOT IN ('done', 'cancelled')
          ORDER BY created_at, work_item_id LIMIT ?`)
        .all(runId, limit) as Row[]
    ).map(workItemFromRow);
  }

  putDecision(value: DecisionRecord): void {
    this.db
      .prepare(`INSERT INTO decisions (
      decision_id, run_id, work_item_id, question, alternatives_json,
      recommendation, status, authority, resolution, version, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        value.decisionId,
        value.runId,
        value.workItemId ?? null,
        value.question,
        value.alternatives ? canonicalJson(value.alternatives) : null,
        value.recommendation ?? null,
        value.status,
        value.authority,
        value.resolution ?? null,
        value.version,
        value.createdAt,
        value.updatedAt,
      );
  }

  getDecision(decisionId: string): DecisionRecord | undefined {
    const row = this.db
      .prepare('SELECT * FROM decisions WHERE decision_id = ?')
      .get(decisionId) as Row | undefined;
    return row ? decisionFromRow(row) : undefined;
  }

  listPendingDecisions(
    runId: string,
    workItemId?: string,
    limit = -1,
  ): DecisionRecord[] {
    const rows = workItemId
      ? this.db
          .prepare(`SELECT * FROM decisions
            WHERE run_id = ? AND status = 'pending'
              AND (work_item_id IS NULL OR work_item_id = ?)
            ORDER BY created_at, decision_id LIMIT ?`)
          .all(runId, workItemId, limit)
      : this.db
          .prepare(`SELECT * FROM decisions
            WHERE run_id = ? AND status = 'pending'
            ORDER BY created_at, decision_id LIMIT ?`)
          .all(runId, limit);
    return (rows as Row[]).map(decisionFromRow);
  }

  resolveDecision(
    decisionId: string,
    expectedVersion: number,
    resolution: string,
    updatedAt: string,
  ): DecisionRecord {
    const result = this.db
      .prepare(`UPDATE decisions SET
        status = 'resolved', resolution = ?, updated_at = ?, version = version + 1
        WHERE decision_id = ? AND version = ? AND status = 'pending'`)
      .run(resolution, updatedAt, decisionId, expectedVersion);
    if (Number(result.changes) === 0) {
      const existing = this.getDecision(decisionId);
      if (!existing) throw new StateError('NOT_FOUND', 'decision not found');
      if (existing.version !== expectedVersion)
        throw new StateError(
          'VERSION_CONFLICT',
          'decision version does not match',
          {
            expectedVersion,
          },
        );
      throw new StateError('INVALID_TRANSITION', 'decision is not pending');
    }
    return this.getDecision(decisionId) as DecisionRecord;
  }

  putEvidence(value: EvidenceRecord): void {
    this.db
      .prepare(`INSERT INTO evidence (
      evidence_id, run_id, work_item_id, kind, summary, status, source_uri,
      command, exit_code, git_sha, artifact_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        value.evidenceId,
        value.runId,
        value.workItemId ?? null,
        value.kind,
        value.summary,
        value.status,
        value.sourceUri ?? null,
        value.command ?? null,
        value.exitCode ?? null,
        value.gitSha ?? null,
        value.artifactId ?? null,
        value.createdAt,
      );
  }

  getEvidence(evidenceId: string): EvidenceRecord | undefined {
    const row = this.db
      .prepare('SELECT * FROM evidence WHERE evidence_id = ?')
      .get(evidenceId) as Row | undefined;
    return row ? evidenceFromRow(row) : undefined;
  }

  listEvidence(runId: string, limit = -1): EvidenceRecord[] {
    return (
      this.db
        .prepare(
          'SELECT * FROM evidence WHERE run_id = ? ORDER BY created_at, evidence_id LIMIT ?',
        )
        .all(runId, limit) as Row[]
    ).map(evidenceFromRow);
  }

  listEvidenceForWorkItem(
    runId: string,
    workItemId: string,
    limit = -1,
  ): EvidenceRecord[] {
    return (
      this.db
        .prepare(`SELECT * FROM evidence
          WHERE run_id = ? AND work_item_id = ?
          ORDER BY created_at, evidence_id LIMIT ?`)
        .all(runId, workItemId, limit) as Row[]
    ).map(evidenceFromRow);
  }

  putArtifact(value: ArtifactRecord): void {
    this.db
      .prepare(`INSERT INTO artifacts (
      artifact_id, sha256, byte_size, media_type, relative_path, preview, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(
        value.artifactId,
        value.sha256,
        value.byteSize,
        value.mediaType,
        value.relativePath,
        value.preview ?? null,
        value.createdAt,
      );
  }

  getArtifact(artifactId: string): ArtifactRecord | undefined {
    const row = this.db
      .prepare('SELECT * FROM artifacts WHERE artifact_id = ?')
      .get(artifactId) as Row | undefined;
    return row ? artifactFromRow(row) : undefined;
  }

  getArtifactBySha256(sha256: string): ArtifactRecord | undefined {
    const row = this.db
      .prepare('SELECT * FROM artifacts WHERE sha256 = ?')
      .get(sha256) as Row | undefined;
    return row ? artifactFromRow(row) : undefined;
  }

  listArtifacts(): ArtifactRecord[] {
    return (
      this.db
        .prepare('SELECT * FROM artifacts ORDER BY created_at, artifact_id')
        .all() as Row[]
    ).map(artifactFromRow);
  }

  putResource(value: ResourceRecord): void {
    this.db
      .prepare(`INSERT INTO resources (
      resource_id, run_id, work_item_id, type, control, owner, native_ref,
      status, cleanup_required, last_error, evidence_id, version, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        value.resourceId,
        value.runId,
        value.workItemId ?? null,
        value.type,
        value.control,
        value.owner,
        value.nativeRef ?? null,
        value.status,
        value.cleanupRequired ? 1 : 0,
        value.lastError ?? null,
        value.evidenceId ?? null,
        value.version,
        value.createdAt,
        value.updatedAt,
      );
  }

  getResource(resourceId: string): ResourceRecord | undefined {
    const row = this.db
      .prepare('SELECT * FROM resources WHERE resource_id = ?')
      .get(resourceId) as Row | undefined;
    return row ? resourceFromRow(row) : undefined;
  }

  updateResource(
    resourceId: string,
    expectedVersion: number,
    patch: {
      nativeRef?: string;
      status: ResourceStatus;
      cleanupRequired: boolean;
      lastError?: string | null;
      evidenceId?: string | null;
    },
    updatedAt: string,
  ): ResourceRecord {
    const result = this.db
      .prepare(`UPDATE resources SET
        native_ref = COALESCE(?, native_ref), status = ?, cleanup_required = ?,
        last_error = ?, evidence_id = ?, updated_at = ?, version = version + 1
        WHERE resource_id = ? AND version = ?`)
      .run(
        patch.nativeRef ?? null,
        patch.status,
        patch.cleanupRequired ? 1 : 0,
        patch.lastError ?? null,
        patch.evidenceId ?? null,
        updatedAt,
        resourceId,
        expectedVersion,
      );
    if (Number(result.changes) === 0) {
      if (!this.getResource(resourceId))
        throw new StateError('NOT_FOUND', 'resource not found');
      throw new StateError(
        'VERSION_CONFLICT',
        'resource version does not match',
        {
          expectedVersion,
        },
      );
    }
    return this.getResource(resourceId) as ResourceRecord;
  }

  listCleanupRequiredResources(runId: string, limit = -1): ResourceRecord[] {
    return (
      this.db
        .prepare(`SELECT * FROM resources
          WHERE run_id = ? AND cleanup_required = 1
          ORDER BY created_at, resource_id LIMIT ?`)
        .all(runId, limit) as Row[]
    ).map(resourceFromRow);
  }

  appendEvent(value: WorkflowEventRecord): WorkflowEventRecord {
    const result = this.db
      .prepare(`INSERT INTO workflow_events (
      event_id, run_id, entity_type, entity_id, event_type, payload_json,
      command_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        value.eventId,
        value.runId,
        value.entityType,
        value.entityId,
        value.eventType,
        canonicalJson(value.payload),
        value.commandId ?? null,
        value.createdAt,
      );
    return { ...value, sequence: Number(result.lastInsertRowid) };
  }

  listEvents(runId: string): WorkflowEventRecord[] {
    return (
      this.db
        .prepare(
          'SELECT * FROM workflow_events WHERE run_id = ? ORDER BY sequence',
        )
        .all(runId) as Row[]
    ).map(eventFromRow);
  }
}
