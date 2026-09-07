import { z } from 'zod';

export const PolicyTraceSchema = z
  .object({
    traceVersion: z.literal(1),
    decision: z.enum(['direct', 'delegate', 'delegate_batch', 'blocked']),
    signals: z.array(z.string().min(1)),
    capabilities: z.array(
      z.enum([
        'context_companion',
        'investigator',
        'executor',
        'verifier',
        'worktree',
        'durable',
      ]),
    ),
    reasons: z.array(z.string().min(1)).min(1),
  })
  .strict();

export type PolicyTrace = z.infer<typeof PolicyTraceSchema>;
