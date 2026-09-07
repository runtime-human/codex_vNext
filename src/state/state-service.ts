import type { DatabaseSync } from 'node:sqlite';

import {
  type AcceptanceSpec,
  AcceptanceSpecSchema,
  type AgentRole,
  canTransition,
  type EvidenceKind,
  type ReadinessLevel,
  validateCompletion,
  type WorkItemState,
} from '../domain/index.js';
import { type Clock, systemClock } from './clock.js';
import { StateError } from './errors.js';
import { executeIdempotent } from './idempotency.js';
import {
  newDecisionId,
  newEventId,
  newEvidenceId,
  newRunId,
  newWorkItemId,
} from './ids.js';
import { type InspectedProject, inspectProject } from './project-inspector.js';
import { redactSensitiveText } from './redaction.js';
import {
  type DecisionRecord,
  type EvidenceRecord,
  type ProjectRecord,
  type RunRecord,
  StateRepositories,
  type WorkItemPatch,
  type WorkItemRecord,
} from './repositories.js';

type ProjectInspector = (root: string) => Promise<InspectedProject>;

export interface StateServiceDependencies {
  db: DatabaseSync;
  repositories?: StateRepositories;
  clock?: Clock;
  projectInspector?: ProjectInspector;
  beforeEvent?: () => void;
}

export interface BeginWorkflowInput {
  commandId: string;
  projectRoot: string;
  objective: string;
  primaryThreadId?: string;
  durable: boolean;
}

export type UpdateWorkItemInput =
  | {
      operation: 'create';
      commandId: string;
      runId: string;
      title: string;
      objective: string;
      risk: 'low' | 'medium' | 'high' | 'critical';
      ownerRole?: AgentRole;
      acceptance: AcceptanceSpec;
    }
  | {
      operation: 'patch';
      commandId: string;
      workItemId: string;
      expectedVersion: number;
      patch: WorkItemPatch;
    };

export interface TransitionWorkItemInput {
  commandId: string;
  workItemId: string;
  expectedVersion: number;
  to: WorkItemState;
  note?: string;
  completion?: {
    achievedLevel: ReadinessLevel;
    evidenceIds: string[];
  };
}

export interface RequestDecisionInput {
  commandId: string;
  runId: string;
  workItemId?: string;
  question: string;
  alternatives?: unknown[];
  recommendation?: string;
  authority: 'main' | 'user';
}

export interface ResolveDecisionInput {
  commandId: string;
  decisionId: string;
  expectedVersion: number;
  resolution: string;
}

export interface RecordEvidenceInput {
  commandId: string;
  runId: string;
  workItemId?: string;
  kind: EvidenceKind;
  summary: string;
  status: 'pass' | 'fail' | 'partial' | 'unknown';
  sourceUri?: string;
  command?: string;
  exitCode?: number;
  gitSha?: string;
  artifactId?: string;
}

function requireValue(value: string, name: string): void {
  if (!value.trim())
    throw new StateError('INVALID_ARGUMENT', `${name} is required`);
}

function withoutCommandId<T extends { commandId: string }>(
  input: T,
): Omit<T, 'commandId'> {
  const { commandId: _commandId, ...rest } = input;
  return rest;
}

export class StateService {
  readonly repositories: StateRepositories;
  private readonly clock: Clock;
  private readonly projectInspector: ProjectInspector;
  private readonly beforeEvent: (() => void) | undefined;

  constructor(private readonly dependencies: StateServiceDependencies) {
    this.repositories =
      dependencies.repositories ?? new StateRepositories(dependencies.db);
    this.clock = dependencies.clock ?? systemClock;
    this.projectInspector = dependencies.projectInspector ?? inspectProject;
    this.beforeEvent = dependencies.beforeEvent;
  }

  private appendEvent(
    runId: string,
    entityType: 'run' | 'work_item' | 'decision' | 'evidence',
    entityId: string,
    eventType: string,
    payload: unknown,
    commandId: string,
  ): void {
    this.beforeEvent?.();
    this.repositories.appendEvent({
      eventId: newEventId(),
      runId,
      entityType,
      entityId,
      eventType,
      payload,
      commandId,
      createdAt: this.clock.nowIso(),
    });
  }

  async beginWorkflow(input: BeginWorkflowInput): Promise<RunRecord> {
    requireValue(input.commandId, 'commandId');
    requireValue(input.projectRoot, 'projectRoot');
    requireValue(input.objective, 'objective');
    if (input.durable) {
      throw new StateError(
        'INVALID_ARGUMENT',
        'durable mode is not available in PH-02',
      );
    }

    const inspection = await this.projectInspector(input.projectRoot);
    const runId = newRunId();
    const normalizedInput = {
      projectRoot: inspection.repoRoot,
      objective: input.objective,
      ...(input.primaryThreadId
        ? { primaryThreadId: input.primaryThreadId }
        : {}),
      durable: false,
    };

    return executeIdempotent({
      db: this.dependencies.db,
      toolName: 'workflow.begin',
      commandId: input.commandId,
      runId,
      normalizedInput,
      clock: this.clock,
      mutate: () => {
        const now = this.clock.nowIso();
        let project = this.repositories.getProjectByRepoKey(inspection.repoKey);
        if (project) {
          project = this.repositories.updateProjectInspection(
            project.projectId,
            inspection,
            now,
          );
        } else {
          project = {
            projectId: `project_${inspection.repoKey}`,
            repoRoot: inspection.repoRoot,
            repoKey: inspection.repoKey,
            repoFingerprint: inspection.repoFingerprint,
            ...(inspection.remoteUrl
              ? { remoteUrl: inspection.remoteUrl }
              : {}),
            ...(inspection.defaultBranch
              ? { defaultBranch: inspection.defaultBranch }
              : {}),
            createdAt: now,
            updatedAt: now,
            version: 1,
          };
          this.repositories.putProject(project);
        }

        const run: RunRecord = {
          runId,
          projectId: project.projectId,
          objective: input.objective,
          state: 'active',
          durable: false,
          ...(input.primaryThreadId
            ? { primaryThreadId: input.primaryThreadId }
            : {}),
          ...(inspection.head ? { repoHeadAtStart: inspection.head } : {}),
          ...(inspection.head ? { lastObservedRepoHead: inspection.head } : {}),
          startedAt: now,
          updatedAt: now,
          version: 1,
        };
        this.repositories.putRun(run);
        this.appendEvent(
          runId,
          'run',
          runId,
          'run.started',
          { state: 'active' },
          input.commandId,
        );
        return run;
      },
    });
  }

  getWorkItem(workItemId: string) {
    const workItem = this.repositories.getWorkItem(workItemId);
    if (!workItem) throw new StateError('NOT_FOUND', 'work item not found');
    return {
      ...workItem,
      evidenceRefs: this.repositories
        .listEvidence(workItem.runId)
        .filter((item) => item.workItemId === workItemId),
      pendingDecisions: this.repositories
        .listPendingDecisions(workItem.runId, workItemId)
        .filter((item) => item.workItemId === workItemId),
    };
  }

  updateWorkItem(input: UpdateWorkItemInput): WorkItemRecord {
    requireValue(input.commandId, 'commandId');
    if (input.operation === 'create') {
      AcceptanceSpecSchema.parse(input.acceptance);
      const workItemId = newWorkItemId();
      return executeIdempotent({
        db: this.dependencies.db,
        toolName: 'work.update',
        commandId: input.commandId,
        runId: input.runId,
        normalizedInput: withoutCommandId(input),
        clock: this.clock,
        mutate: () => {
          if (!this.repositories.getRun(input.runId))
            throw new StateError('NOT_FOUND', 'run not found');
          const now = this.clock.nowIso();
          const item: WorkItemRecord = {
            workItemId,
            runId: input.runId,
            title: input.title,
            objective: input.objective,
            state: 'ready',
            risk: input.risk,
            ...(input.ownerRole ? { ownerRole: input.ownerRole } : {}),
            acceptance: input.acceptance,
            readinessLevel: 'implemented',
            readinessEvidenceIds: [],
            version: 1,
            createdAt: now,
            updatedAt: now,
          };
          this.repositories.putWorkItem(item);
          this.appendEvent(
            input.runId,
            'work_item',
            workItemId,
            'work.created',
            { state: 'ready', version: 1 },
            input.commandId,
          );
          return item;
        },
      });
    }

    if (
      'state' in input.patch ||
      'version' in input.patch ||
      'readinessLevel' in input.patch
    ) {
      throw new StateError(
        'INVALID_ARGUMENT',
        'work.update cannot patch state or readiness',
      );
    }
    if (input.patch.acceptance)
      AcceptanceSpecSchema.parse(input.patch.acceptance);
    const existing = this.repositories.getWorkItem(input.workItemId);
    return executeIdempotent({
      db: this.dependencies.db,
      toolName: 'work.update',
      commandId: input.commandId,
      ...(existing ? { runId: existing.runId } : {}),
      normalizedInput: withoutCommandId(input),
      clock: this.clock,
      mutate: () => {
        const updated = this.repositories.updateWorkItem(
          input.workItemId,
          input.expectedVersion,
          input.patch,
          this.clock.nowIso(),
        );
        this.appendEvent(
          updated.runId,
          'work_item',
          updated.workItemId,
          'work.updated',
          { version: updated.version },
          input.commandId,
        );
        return updated;
      },
    });
  }

  transitionWorkItem(input: TransitionWorkItemInput): WorkItemRecord {
    const current = this.repositories.getWorkItem(input.workItemId);
    return executeIdempotent({
      db: this.dependencies.db,
      toolName: 'work.transition',
      commandId: input.commandId,
      ...(current ? { runId: current.runId } : {}),
      normalizedInput: withoutCommandId(input),
      clock: this.clock,
      mutate: () => {
        const item = this.repositories.getWorkItem(input.workItemId);
        if (!item) throw new StateError('NOT_FOUND', 'work item not found');
        if (item.version !== input.expectedVersion) {
          throw new StateError(
            'VERSION_CONFLICT',
            'work item version does not match',
            {
              expectedVersion: input.expectedVersion,
            },
          );
        }
        if (!canTransition(item.state, input.to)) {
          throw new StateError(
            'INVALID_TRANSITION',
            'work item transition is not allowed',
            {
              from: item.state,
              to: input.to,
            },
          );
        }

        let completion:
          | { readinessLevel: ReadinessLevel; evidenceIds: string[] }
          | undefined;
        if (input.to === 'done') {
          if (!input.completion || input.completion.evidenceIds.length === 0) {
            throw new StateError(
              'COMPLETION_BLOCKED',
              'completion evidence is required',
            );
          }
          const evidence = input.completion.evidenceIds.map((id) =>
            this.repositories.getEvidence(id),
          );
          const invalidReference = evidence.some(
            (entry) =>
              !entry ||
              entry.runId !== item.runId ||
              (entry.workItemId !== undefined &&
                entry.workItemId !== item.workItemId),
          );
          const passing = evidence.filter((entry): entry is EvidenceRecord =>
            Boolean(entry && entry.status === 'pass'),
          );
          const validation = validateCompletion({
            requiredLevel: item.acceptance.requiredLevel,
            achievedLevel: input.completion.achievedLevel,
            requiredEvidenceKinds: item.acceptance.requiredEvidenceKinds,
            availableEvidenceKinds: passing.map((entry) => entry.kind),
            unresolvedRequiredDecision:
              this.repositories.listPendingDecisions(
                item.runId,
                item.workItemId,
              ).length > 0,
          });
          const reasons = [
            ...(invalidReference
              ? ['referenced evidence is missing or out of scope']
              : []),
            ...(evidence.some((entry) => entry && entry.status !== 'pass')
              ? ['referenced evidence is not passing']
              : []),
            ...(validation.ok ? [] : validation.reasons),
          ];
          if (reasons.length > 0) {
            throw new StateError(
              'COMPLETION_BLOCKED',
              'completion requirements are not met',
              {
                reasons,
              },
            );
          }
          completion = {
            readinessLevel: input.completion.achievedLevel,
            evidenceIds: input.completion.evidenceIds,
          };
        } else if (input.completion) {
          throw new StateError(
            'INVALID_ARGUMENT',
            'completion is only valid for done',
          );
        }

        const updated = this.repositories.setWorkItemState(
          item.workItemId,
          input.expectedVersion,
          input.to,
          this.clock.nowIso(),
          completion,
        );
        this.appendEvent(
          updated.runId,
          'work_item',
          updated.workItemId,
          'work.transitioned',
          { from: item.state, to: updated.state, version: updated.version },
          input.commandId,
        );
        return updated;
      },
    });
  }

  requestDecision(input: RequestDecisionInput): DecisionRecord {
    const decisionId = newDecisionId();
    return executeIdempotent({
      db: this.dependencies.db,
      toolName: 'decision.request',
      commandId: input.commandId,
      runId: input.runId,
      normalizedInput: withoutCommandId(input),
      clock: this.clock,
      mutate: () => {
        if (!this.repositories.getRun(input.runId))
          throw new StateError('NOT_FOUND', 'run not found');
        if (input.workItemId) {
          const workItem = this.repositories.getWorkItem(input.workItemId);
          if (!workItem || workItem.runId !== input.runId)
            throw new StateError('NOT_FOUND', 'work item not found in run');
        }
        const now = this.clock.nowIso();
        const decision: DecisionRecord = {
          decisionId,
          runId: input.runId,
          ...(input.workItemId ? { workItemId: input.workItemId } : {}),
          question: input.question,
          ...(input.alternatives ? { alternatives: input.alternatives } : {}),
          ...(input.recommendation
            ? { recommendation: input.recommendation }
            : {}),
          status: 'pending',
          authority: input.authority,
          version: 1,
          createdAt: now,
          updatedAt: now,
        };
        this.repositories.putDecision(decision);
        this.appendEvent(
          input.runId,
          'decision',
          decisionId,
          'decision.requested',
          { authority: input.authority, status: 'pending' },
          input.commandId,
        );
        return decision;
      },
    });
  }

  resolveDecision(input: ResolveDecisionInput): DecisionRecord {
    const current = this.repositories.getDecision(input.decisionId);
    return executeIdempotent({
      db: this.dependencies.db,
      toolName: 'decision.resolve',
      commandId: input.commandId,
      ...(current ? { runId: current.runId } : {}),
      normalizedInput: withoutCommandId(input),
      clock: this.clock,
      mutate: () => {
        const decision = this.repositories.resolveDecision(
          input.decisionId,
          input.expectedVersion,
          input.resolution,
          this.clock.nowIso(),
        );
        this.appendEvent(
          decision.runId,
          'decision',
          decision.decisionId,
          'decision.resolved',
          { status: 'resolved', version: decision.version },
          input.commandId,
        );
        return decision;
      },
    });
  }

  recordEvidence(input: RecordEvidenceInput): EvidenceRecord {
    const evidenceId = newEvidenceId();
    return executeIdempotent({
      db: this.dependencies.db,
      toolName: 'evidence.record',
      commandId: input.commandId,
      runId: input.runId,
      normalizedInput: withoutCommandId(input),
      clock: this.clock,
      mutate: () => {
        if (!this.repositories.getRun(input.runId))
          throw new StateError('NOT_FOUND', 'run not found');
        if (input.workItemId) {
          const workItem = this.repositories.getWorkItem(input.workItemId);
          if (!workItem || workItem.runId !== input.runId)
            throw new StateError('NOT_FOUND', 'work item not found in run');
        }
        if (
          input.artifactId &&
          !this.repositories.getArtifact(input.artifactId)
        )
          throw new StateError('NOT_FOUND', 'artifact not found');
        const evidence: EvidenceRecord = {
          evidenceId,
          runId: input.runId,
          ...(input.workItemId ? { workItemId: input.workItemId } : {}),
          kind: input.kind,
          summary: redactSensitiveText(input.summary),
          status: input.status,
          ...(input.sourceUri ? { sourceUri: input.sourceUri } : {}),
          ...(input.command
            ? { command: redactSensitiveText(input.command) }
            : {}),
          ...(input.exitCode !== undefined ? { exitCode: input.exitCode } : {}),
          ...(input.gitSha ? { gitSha: input.gitSha } : {}),
          ...(input.artifactId ? { artifactId: input.artifactId } : {}),
          createdAt: this.clock.nowIso(),
        };
        this.repositories.putEvidence(evidence);
        this.appendEvent(
          input.runId,
          'evidence',
          evidenceId,
          'evidence.recorded',
          { kind: evidence.kind, status: evidence.status },
          input.commandId,
        );
        return evidence;
      },
    });
  }

  async getWorkflowSummary(input: { projectRoot?: string; runId?: string }) {
    if (!input.projectRoot && !input.runId) {
      throw new StateError(
        'INVALID_ARGUMENT',
        'projectRoot or runId is required',
      );
    }

    const currentInspection = input.projectRoot
      ? await this.projectInspector(input.projectRoot)
      : undefined;
    let project: ProjectRecord | undefined;
    let run: RunRecord | undefined;
    if (input.runId) {
      run = this.repositories.getRun(input.runId);
      project = run ? this.repositories.getProject(run.projectId) : undefined;
    } else if (currentInspection) {
      project = this.repositories.getProjectByRepoKey(
        currentInspection.repoKey,
      );
      run = project
        ? this.repositories.getLatestRunForProject(project.projectId)
        : undefined;
    }

    if (!run || !project) {
      return {
        activeWork: [],
        pendingDecisions: [],
        evidenceRefs: [],
        cleanupRequiredResources: [],
        nextSafeAction: 'start_run' as const,
      };
    }

    const inspection =
      currentInspection ?? (await this.projectInspector(project.repoRoot));
    const repoDrift = !inspection.gitAvailable
      ? 'git_unavailable'
      : inspection.repoFingerprint !== project.repoFingerprint
        ? 'project_identity_changed'
        : run.lastObservedRepoHead &&
            inspection.head !== run.lastObservedRepoHead
          ? 'head_changed'
          : 'none';
    const activeWork = this.repositories
      .listWorkItems(run.runId)
      .filter((item) => item.state !== 'done' && item.state !== 'cancelled')
      .map((item) => ({
        workItemId: item.workItemId,
        title: item.title,
        state: item.state,
        risk: item.risk,
        version: item.version,
        liveness: 'unknown' as const,
      }));
    const pendingDecisions = this.repositories
      .listPendingDecisions(run.runId)
      .map((item) => ({
        decisionId: item.decisionId,
        ...(item.workItemId ? { workItemId: item.workItemId } : {}),
        question: item.question,
        authority: item.authority,
      }));
    const evidenceRefs = this.repositories
      .listEvidence(run.runId)
      .map((item) => ({
        evidenceId: item.evidenceId,
        ...(item.workItemId ? { workItemId: item.workItemId } : {}),
        kind: item.kind,
        status: item.status,
        summary: item.summary,
      }));
    const cleanupRequiredResources = this.repositories
      .listCleanupRequiredResources(run.runId)
      .map((item) => ({
        resourceId: item.resourceId,
        type: item.type,
        ...(item.nativeRef ? { nativeRef: item.nativeRef } : {}),
        status: item.status,
      }));
    const nextSafeAction =
      pendingDecisions.length > 0
        ? 'resolve_decision'
        : repoDrift !== 'none'
          ? 'inspect_repo_drift'
          : cleanupRequiredResources.length > 0
            ? 'inspect_cleanup'
            : activeWork.some((item) =>
                  ['running', 'verifying'].includes(item.state),
                )
              ? 'reconcile_active_work'
              : activeWork.some((item) => item.state === 'ready')
                ? 'resume_work'
                : 'none';

    return {
      project: {
        projectId: project.projectId,
        repoRoot: project.repoRoot,
        repoFingerprint: project.repoFingerprint,
        ...(inspection.head ? { currentHead: inspection.head } : {}),
        repoDrift,
      },
      run: {
        runId: run.runId,
        objective: run.objective,
        state: run.state,
        startedAt: run.startedAt,
        updatedAt: run.updatedAt,
      },
      activeWork,
      pendingDecisions,
      evidenceRefs,
      cleanupRequiredResources,
      nextSafeAction,
    };
  }
}
