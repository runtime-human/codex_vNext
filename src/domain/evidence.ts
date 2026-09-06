import { z } from 'zod';
import { EvidenceKindSchema } from './acceptance.js';
import { EvidenceIdSchema, WorkItemIdSchema } from './ids.js';

export const EvidenceSchema = z
  .object({
    evidenceId: EvidenceIdSchema,
    workItemId: WorkItemIdSchema.optional(),
    kind: EvidenceKindSchema,
    summary: z.string().min(1),
    status: z.enum(['pass', 'fail', 'partial', 'unknown']),
    sourceUri: z.string().min(1).optional(),
    command: z.string().min(1).optional(),
    exitCode: z.number().int().optional(),
    gitSha: z.string().min(1).optional(),
    createdAt: z.string().datetime(),
  })
  .strict();

export type Evidence = z.infer<typeof EvidenceSchema>;
