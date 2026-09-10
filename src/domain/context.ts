import { z } from 'zod';
import {
  ContextIdSchema,
  DecisionIdSchema,
  EvidenceIdSchema,
  ProjectIdSchema,
  RunIdSchema,
  TaskIdSchema,
} from './ids.js';

export const ContextKindSchema = z.enum([
  'module_summary',
  'source_pointer',
  'test_pointer',
  'decision_pointer',
  'history_pointer',
  'pitfall',
  'dependency_pointer',
]);
export type ContextKind = z.infer<typeof ContextKindSchema>;

function isCanonicalRepoSource(value: string): boolean {
  const relative = value.slice('repo:'.length);
  if (
    !relative ||
    relative.includes('\0') ||
    relative.includes('\\') ||
    relative.startsWith('/') ||
    /^[A-Za-z]:/u.test(relative)
  ) {
    return false;
  }
  const segments = relative.split('/');
  return segments.every(
    (segment) => segment.length > 0 && segment !== '.' && segment !== '..',
  );
}

function isCanonicalIdSource(
  value: string,
  prefix: 'decision:' | 'evidence:' | 'work:',
): boolean {
  const id = value.slice(prefix.length);
  if (!id || id !== id.trim()) return false;
  const schema =
    prefix === 'decision:'
      ? DecisionIdSchema
      : prefix === 'evidence:'
        ? EvidenceIdSchema
        : z.string().min(1);
  return schema.safeParse(id).success;
}

function isCanonicalExternalSource(value: string): boolean {
  const raw = value.slice('external:'.length);
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
    if (url.username || url.password || url.search || url.hash) return false;
    return raw === url.toString() || raw === url.toString().replace(/\/$/u, '');
  } catch {
    return false;
  }
}

export function isCanonicalContextSourceUri(value: string): boolean {
  if (value.startsWith('repo:')) return isCanonicalRepoSource(value);
  if (value.startsWith('decision:'))
    return isCanonicalIdSource(value, 'decision:');
  if (value.startsWith('evidence:'))
    return isCanonicalIdSource(value, 'evidence:');
  if (value.startsWith('work:')) return isCanonicalIdSource(value, 'work:');
  if (value.startsWith('external:')) return isCanonicalExternalSource(value);
  return false;
}

export const ContextSourceUriSchema = z
  .string()
  .min(1)
  .max(2048)
  .superRefine((value, context) => {
    if (!isCanonicalContextSourceUri(value)) {
      context.addIssue({
        code: 'custom',
        message: 'context source URI must use a supported canonical form',
      });
    }
  });

export const ContextItemSchema = z
  .object({
    contextId: ContextIdSchema,
    projectId: ProjectIdSchema,
    kind: ContextKindSchema,
    scope: z.string().min(1),
    summary: z.string().min(1),
    // PH-01 compatibility: canonical PH-03 source validation happens before
    // persistence/output rather than narrowing already accepted PH-01 values.
    sourceUri: z.string().min(1),
    sourceHash: z.string().min(1).optional(),
    gitSha: z.string().min(1).optional(),
    verifiedAt: z.string().datetime(),
    stale: z.boolean(),
  })
  .strict();

export type ContextItem = z.infer<typeof ContextItemSchema>;

export const ContextFreshnessSchema = z.enum([
  'fresh',
  'stale',
  'unverifiable',
]);
export type ContextFreshness = z.infer<typeof ContextFreshnessSchema>;

export const ContextStaleReasonSchema = z.enum([
  'persisted_stale',
  'source_missing',
  'source_hash_changed',
  'source_unresolvable',
  'none',
]);
export type ContextStaleReason = z.infer<typeof ContextStaleReasonSchema>;

export const ContextQuerySchema = z
  .object({
    projectId: ProjectIdSchema,
    scopes: z.array(z.string().min(1).max(256)).max(8).default([]),
    kinds: z.array(ContextKindSchema).max(8).default([]),
    terms: z.array(z.string().trim().min(1).max(64)).max(8).default([]),
    includeStale: z.boolean().default(false),
    includeUnverifiable: z.boolean().default(false),
    limit: z.number().int().min(1).max(12).default(8),
  })
  .strict();
export type ContextQuery = z.infer<typeof ContextQuerySchema>;

export const ContextQueryHitSchema = z
  .object({
    item: ContextItemSchema,
    freshness: ContextFreshnessSchema,
    staleReason: ContextStaleReasonSchema,
    score: z.number().int(),
  })
  .strict();
export type ContextQueryHit = z.infer<typeof ContextQueryHitSchema>;

export const ContextQueryResultSchema = z
  .object({
    projectId: ProjectIdSchema,
    hits: z.array(ContextQueryHitSchema).max(12),
    truncated: z.boolean(),
  })
  .strict();
export type ContextQueryResult = z.infer<typeof ContextQueryResultSchema>;

export const CompanionHydrationCapsuleSchema = z
  .object({
    capsuleVersion: z.literal(1),
    taskId: TaskIdSchema,
    projectId: ProjectIdSchema,
    runId: RunIdSchema,
    objective: z.string().min(1).max(2000),
    repoHead: z.string().min(1).max(128).optional(),
    contextItems: z.array(ContextItemSchema).max(10),
    relevantDecisionIds: z.array(DecisionIdSchema).max(12),
    evidenceIds: z.array(EvidenceIdSchema).max(12),
    unresolvedQuestions: z.array(z.string().min(1).max(500)).max(8),
  })
  .strict();
export type CompanionHydrationCapsule = z.infer<
  typeof CompanionHydrationCapsuleSchema
>;

export const ContextDeltaKindSchema = z.enum([
  'relevant',
  'new',
  'changed',
  'stale',
  'decision_needed',
]);
export type ContextDeltaKind = z.infer<typeof ContextDeltaKindSchema>;

export const ContextDeltaItemSchema = z
  .object({
    kind: ContextDeltaKindSchema,
    contextId: ContextIdSchema.optional(),
    contextKind: ContextKindSchema,
    scope: z.string().min(1).max(256),
    summary: z.string().min(1).max(1600),
    sourceUri: ContextSourceUriSchema,
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/u).optional(),
    gitSha: z.string().min(7).max(64).optional(),
    replacesContextId: ContextIdSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const repositorySource = value.sourceUri.startsWith('repo:');
    if (
      repositorySource &&
      ['new', 'changed', 'stale'].includes(value.kind) &&
      !value.sourceHash
    ) {
      context.addIssue({
        code: 'custom',
        path: ['sourceHash'],
        message: 'repo context mutations require sourceHash',
      });
    }
    if (
      value.kind === 'changed' &&
      !value.contextId &&
      !value.replacesContextId
    ) {
      context.addIssue({
        code: 'custom',
        message: 'changed context requires contextId or replacesContextId',
      });
    }
  });
export type ContextDeltaItem = z.infer<typeof ContextDeltaItemSchema>;

export const ContextDeltaSchema = z
  .object({
    deltaVersion: z.literal(1),
    taskId: TaskIdSchema,
    baseRepoHead: z.string().min(1).max(128).optional(),
    items: z.array(ContextDeltaItemSchema).max(16),
    unresolvedQuestions: z.array(z.string().min(1).max(500)).max(8),
  })
  .strict();
export type ContextDelta = z.infer<typeof ContextDeltaSchema>;
