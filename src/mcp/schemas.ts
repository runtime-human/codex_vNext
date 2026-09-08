import { z } from 'zod';

import {
  AcceptanceSpecSchema,
  AgentRoleSchema,
  EvidenceKindSchema,
  ReadinessLevelSchema,
  WorkItemStateSchema,
} from '../domain/index.js';

export const MutationMetaSchema = z
  .object({ commandId: z.string().min(1).max(160) })
  .strict();

const commandId = MutationMetaSchema.shape.commandId;
const version = z.number().int().min(1);
const risk = z.enum(['low', 'medium', 'high', 'critical']);

export const WorkflowSummaryInputSchema = z
  .object({
    projectRoot: z.string().min(1).optional(),
    runId: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.projectRoot && !value.runId) {
      context.addIssue({
        code: 'custom',
        message: 'projectRoot or runId is required',
      });
    }
  });

export const WorkflowBeginInputSchema = z
  .object({
    commandId,
    projectRoot: z.string().min(1),
    objective: z.string().min(1),
    primaryThreadId: z.string().min(1).optional(),
    durable: z.literal(false).default(false),
  })
  .strict();

export const WorkGetInputSchema = z
  .object({ workItemId: z.string().min(1) })
  .strict();

export const WorkUpdateInputSchema = z.discriminatedUnion('operation', [
  z
    .object({
      operation: z.literal('create'),
      commandId,
      runId: z.string().min(1),
      title: z.string().min(1),
      objective: z.string().min(1),
      risk,
      ownerRole: AgentRoleSchema.optional(),
      acceptance: AcceptanceSpecSchema,
    })
    .strict(),
  z
    .object({
      operation: z.literal('patch'),
      commandId,
      workItemId: z.string().min(1),
      expectedVersion: version,
      patch: z
        .object({
          title: z.string().min(1).optional(),
          objective: z.string().min(1).optional(),
          risk: risk.optional(),
          ownerRole: AgentRoleSchema.nullable().optional(),
          nativeThreadId: z.string().min(1).nullable().optional(),
          worktreeRef: z.string().min(1).nullable().optional(),
          acceptance: AcceptanceSpecSchema.optional(),
        })
        .strict(),
    })
    .strict(),
]);

export const WorkTransitionInputSchema = z.discriminatedUnion('to', [
  z
    .object({
      commandId,
      workItemId: z.string().min(1),
      expectedVersion: version,
      to: z.enum([
        'ready',
        'running',
        'verifying',
        'needs_decision',
        'needs_review',
        'blocked',
        'cancelled',
      ]),
      note: z.string().min(1).optional(),
    })
    .strict(),
  z
    .object({
      commandId,
      workItemId: z.string().min(1),
      expectedVersion: version,
      to: z.literal('done'),
      completion: z
        .object({
          achievedLevel: ReadinessLevelSchema,
          evidenceIds: z.array(z.string().min(1)).min(1),
        })
        .strict(),
    })
    .strict(),
]);

export const DecisionRequestInputSchema = z
  .object({
    commandId,
    runId: z.string().min(1),
    workItemId: z.string().min(1).optional(),
    question: z.string().min(1),
    alternatives: z
      .array(
        z
          .object({
            id: z.string().min(1),
            label: z.string().min(1),
            consequence: z.string().min(1).optional(),
          })
          .strict(),
      )
      .optional(),
    recommendation: z.string().min(1).optional(),
    authority: z.enum(['main', 'user']),
  })
  .strict();

export const DecisionResolveInputSchema = z
  .object({
    commandId,
    decisionId: z.string().min(1),
    expectedVersion: version,
    resolution: z.string().min(1),
  })
  .strict();

export const EvidenceRecordInputSchema = z
  .object({
    commandId,
    runId: z.string().min(1),
    workItemId: z.string().min(1).optional(),
    kind: EvidenceKindSchema,
    summary: z.string().min(1),
    status: z.enum(['pass', 'fail', 'partial', 'unknown']),
    sourceUri: z.string().min(1).optional(),
    command: z.string().min(1).optional(),
    exitCode: z.number().int().optional(),
    gitSha: z.string().min(1).optional(),
    artifactId: z.string().min(1).optional(),
  })
  .strict();

export const ResourceTypeSchema = z.enum([
  'agent_thread',
  'worktree',
  'temporary_branch',
  'tool_session',
  'test_run',
  'other',
]);

export const ResourceRecordInputSchema = z.discriminatedUnion('operation', [
  z
    .object({
      operation: z.literal('intent'),
      commandId,
      runId: z.string().min(1),
      workItemId: z.string().min(1).optional(),
      type: ResourceTypeSchema,
      owner: z.string().min(1),
      cleanupRequired: z.boolean(),
    })
    .strict(),
  z
    .object({
      operation: z.literal('observe'),
      commandId,
      runId: z.string().min(1),
      workItemId: z.string().min(1).optional(),
      type: ResourceTypeSchema,
      owner: z.string().min(1),
      nativeRef: z.string().min(1),
    })
    .strict(),
  z
    .object({
      operation: z.literal('attach'),
      commandId,
      resourceId: z.string().min(1),
      expectedVersion: version,
      nativeRef: z.string().min(1),
    })
    .strict(),
  z
    .object({
      operation: z.literal('transition'),
      commandId,
      resourceId: z.string().min(1),
      expectedVersion: version,
      to: z.enum(['running', 'completed', 'failed', 'cleaned']),
      error: z.string().min(1).optional(),
      evidenceId: z.string().min(1).optional(),
    })
    .strict(),
]);

const timestamp = z.string().datetime();
const runState = z.enum([
  'active',
  'paused',
  'blocked',
  'completed',
  'cancelled',
]);
const evidenceStatus = z.enum(['pass', 'fail', 'partial', 'unknown']);

const RunOutputSchema = z
  .object({
    runId: z.string(),
    projectId: z.string(),
    objective: z.string(),
    state: runState,
    durable: z.boolean(),
    primaryThreadId: z.string().optional(),
    repoHeadAtStart: z.string().optional(),
    lastObservedRepoHead: z.string().optional(),
    startedAt: timestamp,
    updatedAt: timestamp,
    version,
  })
  .strict();

const WorkItemOutputSchema = z
  .object({
    workItemId: z.string(),
    runId: z.string(),
    title: z.string(),
    objective: z.string(),
    state: WorkItemStateSchema,
    risk,
    ownerRole: AgentRoleSchema.optional(),
    nativeThreadId: z.string().optional(),
    worktreeRef: z.string().optional(),
    acceptance: AcceptanceSpecSchema,
    readinessLevel: ReadinessLevelSchema,
    readinessEvidenceIds: z.array(z.string()),
    version,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .strict();

const DecisionOutputSchema = z
  .object({
    decisionId: z.string(),
    runId: z.string(),
    workItemId: z.string().optional(),
    question: z.string(),
    alternatives: z
      .array(
        z
          .object({
            id: z.string(),
            label: z.string(),
            consequence: z.string().optional(),
          })
          .strict(),
      )
      .optional(),
    recommendation: z.string().optional(),
    status: z.enum(['pending', 'resolved', 'superseded']),
    authority: z.enum(['main', 'user']),
    resolution: z.string().optional(),
    version,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .strict();

const EvidenceOutputSchema = z
  .object({
    evidenceId: z.string(),
    runId: z.string(),
    workItemId: z.string().optional(),
    kind: EvidenceKindSchema,
    summary: z.string(),
    status: evidenceStatus,
    sourceUri: z.string().optional(),
    command: z.string().optional(),
    exitCode: z.number().int().optional(),
    gitSha: z.string().optional(),
    artifactId: z.string().optional(),
    createdAt: timestamp,
  })
  .strict();

const ResourceOutputSchema = z
  .object({
    resourceId: z.string(),
    runId: z.string(),
    workItemId: z.string().optional(),
    type: ResourceTypeSchema,
    control: z.enum(['coordinated', 'observed']),
    owner: z.string(),
    nativeRef: z.string().optional(),
    status: z.enum([
      'intent_recorded',
      'observed',
      'attached',
      'running',
      'completed',
      'failed',
      'cleaned',
    ]),
    cleanupRequired: z.boolean(),
    lastError: z.string().optional(),
    evidenceId: z.string().optional(),
    version,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .strict();

export const WorkflowSummaryOutputSchema = z
  .object({
    project: z
      .object({
        projectId: z.string(),
        repoRoot: z.string(),
        repoFingerprint: z.string(),
        currentHead: z.string().optional(),
        repoDrift: z.enum([
          'none',
          'head_changed',
          'project_identity_changed',
          'git_unavailable',
        ]),
      })
      .strict()
      .optional(),
    run: z
      .object({
        runId: z.string(),
        objective: z.string(),
        state: runState,
        startedAt: timestamp,
        updatedAt: timestamp,
      })
      .strict()
      .optional(),
    activeWork: z.array(
      z
        .object({
          workItemId: z.string(),
          title: z.string(),
          state: WorkItemStateSchema,
          risk,
          version,
          liveness: z.literal('unknown'),
        })
        .strict(),
    ),
    pendingDecisions: z.array(
      z
        .object({
          decisionId: z.string(),
          workItemId: z.string().optional(),
          question: z.string(),
          authority: z.enum(['main', 'user']),
        })
        .strict(),
    ),
    evidenceRefs: z.array(
      z
        .object({
          evidenceId: z.string(),
          workItemId: z.string().optional(),
          kind: EvidenceKindSchema,
          status: evidenceStatus,
          summary: z.string(),
        })
        .strict(),
    ),
    cleanupRequiredResources: z.array(
      z
        .object({
          resourceId: z.string(),
          type: ResourceTypeSchema,
          nativeRef: z.string().optional(),
          status: ResourceOutputSchema.shape.status,
        })
        .strict(),
    ),
    nextSafeAction: z.enum([
      'start_run',
      'resolve_decision',
      'inspect_repo_drift',
      'reconcile_active_work',
      'inspect_cleanup',
      'resume_work',
      'verify_work',
      'none',
    ]),
  })
  .strict();

const WorkGetOutputSchema = z
  .object({
    ...WorkItemOutputSchema.shape,
    evidenceRefs: z.array(EvidenceOutputSchema),
    pendingDecisions: z.array(DecisionOutputSchema),
  })
  .strict();

const ToolErrorSchema = z
  .object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.json()).optional(),
  })
  .strict();

function toolOutput<T extends z.ZodType>(value: T) {
  return z.discriminatedUnion('ok', [
    z.object({ ok: z.literal(true), value }).strict(),
    z.object({ ok: z.literal(false), error: ToolErrorSchema }).strict(),
  ]);
}

export const MCP_OUTPUT_SCHEMAS = {
  'workflow.summary': toolOutput(WorkflowSummaryOutputSchema),
  'workflow.begin': toolOutput(RunOutputSchema),
  'work.get': toolOutput(WorkGetOutputSchema),
  'work.update': toolOutput(WorkItemOutputSchema),
  'work.transition': toolOutput(WorkItemOutputSchema),
  'decision.request': toolOutput(DecisionOutputSchema),
  'decision.resolve': toolOutput(DecisionOutputSchema),
  'evidence.record': toolOutput(EvidenceOutputSchema),
  'resource.record': toolOutput(ResourceOutputSchema),
} as const;

export const MCP_INPUT_SCHEMAS = {
  'workflow.summary': WorkflowSummaryInputSchema,
  'workflow.begin': WorkflowBeginInputSchema,
  'work.get': WorkGetInputSchema,
  'work.update': WorkUpdateInputSchema,
  'work.transition': WorkTransitionInputSchema,
  'decision.request': DecisionRequestInputSchema,
  'decision.resolve': DecisionResolveInputSchema,
  'evidence.record': EvidenceRecordInputSchema,
  'resource.record': ResourceRecordInputSchema,
} as const;
