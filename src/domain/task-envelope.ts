import { z } from 'zod';
import { AcceptanceSpecSchema } from './acceptance.js';
import { AgentRoleSchema } from './agents.js';
import { AuthorityEnvelopeSchema } from './authority.js';
import { EvidenceIdSchema, TaskIdSchema, WorkItemIdSchema } from './ids.js';

export const ContextRefSchema = z
  .object({
    uri: z.string().min(1),
    summary: z.string().min(1),
    sourceHash: z.string().min(1).optional(),
    gitSha: z.string().min(1).optional(),
  })
  .strict();

export const EvidenceRefSchema = z
  .object({
    evidenceId: EvidenceIdSchema,
    summary: z.string().min(1),
  })
  .strict();

export const ReturnContractSchema = z
  .object({
    mode: z.enum(['compact', 'normal', 'material']),
    includeEvidenceRefs: z.boolean(),
    reportBlockersImmediately: z.boolean(),
    intermediatePolicy: z.literal('decision_changing_only'),
  })
  .strict();

export const TaskEnvelopeSchema = z
  .object({
    envelopeVersion: z.literal(1),
    taskId: TaskIdSchema,
    workItemId: WorkItemIdSchema.optional(),
    role: AgentRoleSchema,
    objective: z.string().min(1),
    expectedOutcome: z.string().min(1),
    writableScope: z.array(z.string().min(1)),
    protectedScope: z.array(z.string().min(1)),
    constraints: z.array(z.string().min(1)),
    contextRefs: z.array(ContextRefSchema),
    relevantDecisions: z.array(EvidenceRefSchema),
    acceptance: AcceptanceSpecSchema,
    authority: AuthorityEnvelopeSchema,
    returnContract: ReturnContractSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.authority.write === 'bounded' &&
      value.writableScope.length === 0
    ) {
      context.addIssue({
        code: 'custom',
        path: ['writableScope'],
        message: 'bounded write authority requires at least one writable scope',
      });
    }
  });

export const ContextRolePayloadSchema = z
  .object({
    kind: z.literal('context'),
    questions: z.array(z.string().min(1)).min(1),
    scopes: z.array(z.string().min(1)).min(1),
  })
  .strict();

export const ResearchRolePayloadSchema = z
  .object({
    kind: z.literal('research'),
    questions: z.array(z.string().min(1)).min(1),
    sourcePolicy: z.enum(['official_first', 'mixed', 'provided_only']),
  })
  .strict();

export const ImplementationRolePayloadSchema = z
  .object({
    kind: z.literal('implementation'),
    changeIntent: z.array(z.string().min(1)).min(1),
    focusedChecks: z.array(z.string().min(1)),
  })
  .strict();

export const VerificationRolePayloadSchema = z
  .object({
    kind: z.literal('verification'),
    claimsToVerify: z.array(z.string().min(1)).min(1),
    independenceRequired: z.boolean(),
  })
  .strict();

export const RolePayloadSchema = z.discriminatedUnion('kind', [
  ContextRolePayloadSchema,
  ResearchRolePayloadSchema,
  ImplementationRolePayloadSchema,
  VerificationRolePayloadSchema,
]);

export const TaskPacketSchema = z
  .object({
    envelope: TaskEnvelopeSchema,
    payload: RolePayloadSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const allowedKindsByRole: Record<string, string[]> = {
      context_companion: ['context'],
      investigator: ['research'],
      executor: ['implementation'],
      senior_executor: ['implementation'],
      verifier: ['verification'],
    };

    if (
      !allowedKindsByRole[value.envelope.role]?.includes(value.payload.kind)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['payload', 'kind'],
        message: `payload kind ${value.payload.kind} is not valid for role ${value.envelope.role}`,
      });
    }
  });

export const TaskDeltaSchema = z
  .object({
    deltaVersion: z.literal(1),
    taskId: TaskIdSchema,
    changedObjective: z.string().min(1).optional(),
    addConstraints: z.array(z.string().min(1)).optional(),
    removeConstraints: z.array(z.string().min(1)).optional(),
    addContextRefs: z.array(ContextRefSchema).optional(),
    addEvidenceRefs: z.array(EvidenceRefSchema).optional(),
    changedAcceptance: AcceptanceSpecSchema.optional(),
    note: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const hasChange = Object.entries(value).some(
      ([key, field]) =>
        !['deltaVersion', 'taskId'].includes(key) && field !== undefined,
    );
    if (!hasChange) {
      context.addIssue({
        code: 'custom',
        message: 'TaskDelta must contain at least one change',
      });
    }
  });

export type ContextRef = z.infer<typeof ContextRefSchema>;
export type EvidenceRef = z.infer<typeof EvidenceRefSchema>;
export type ReturnContract = z.infer<typeof ReturnContractSchema>;
export type TaskEnvelope = z.infer<typeof TaskEnvelopeSchema>;
export type RolePayload = z.infer<typeof RolePayloadSchema>;
export type TaskPacket = z.infer<typeof TaskPacketSchema>;
export type TaskDelta = z.infer<typeof TaskDeltaSchema>;
