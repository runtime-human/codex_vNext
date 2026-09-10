import { z } from 'zod';

import {
  CompanionHydrationCapsuleSchema,
  ContextDeltaSchema,
  ContextIdSchema,
  ContextKindSchema,
  ContextQueryHitSchema,
  ContextQueryResultSchema,
  ContextQuerySchema,
  DecisionIdSchema,
  EvidenceIdSchema,
  ProjectIdSchema,
  RunIdSchema,
  TaskIdSchema,
} from '../domain/index.js';

const scope = z.string().min(1).max(256);
const term = z.string().trim().min(1).max(64);
const question = z.string().min(1).max(500);
const commandId = z.string().min(1).max(160);

export const ContextGetInputSchema = z
  .object({
    projectId: ProjectIdSchema,
    contextId: ContextIdSchema,
    includeStale: z.boolean().optional(),
    includeUnverifiable: z.boolean().optional(),
  })
  .strict();

export const ContextQueryInputSchema = ContextQuerySchema;

export const ContextHydrateInputSchema = z
  .object({
    taskId: TaskIdSchema,
    projectId: ProjectIdSchema,
    runId: RunIdSchema,
    scopes: z.array(scope).max(8).optional(),
    kinds: z.array(ContextKindSchema).max(8).optional(),
    terms: z.array(term).max(8).optional(),
    decisionIds: z.array(DecisionIdSchema).max(12).optional(),
    evidenceIds: z.array(EvidenceIdSchema).max(12).optional(),
    unresolvedQuestions: z.array(question).max(8).optional(),
  })
  .strict();

export const ContextIngestDeltaInputSchema = z
  .object({
    commandId,
    projectId: ProjectIdSchema,
    runId: RunIdSchema,
    expectedTaskId: TaskIdSchema,
    delta: ContextDeltaSchema,
  })
  .strict();

export const ContextIngestDeltaResultSchema = z
  .object({
    projectId: ProjectIdSchema,
    runId: RunIdSchema,
    taskId: TaskIdSchema,
    insertedContextIds: z.array(ContextIdSchema).max(16),
    staleContextIds: z.array(ContextIdSchema).max(200),
    acceptedItems: z.number().int().min(0).max(16),
    unresolvedQuestions: z.array(question).max(8),
  })
  .strict();

export const CONTEXT_INPUT_SCHEMAS = {
  'context.get': ContextGetInputSchema,
  'context.query': ContextQueryInputSchema,
  'context.hydrate': ContextHydrateInputSchema,
  'context.ingest_delta': ContextIngestDeltaInputSchema,
} as const;

export const CONTEXT_OUTPUT_VALUE_SCHEMAS = {
  'context.get': ContextQueryHitSchema,
  'context.query': ContextQueryResultSchema,
  'context.hydrate': CompanionHydrationCapsuleSchema,
  'context.ingest_delta': ContextIngestDeltaResultSchema,
} as const;
