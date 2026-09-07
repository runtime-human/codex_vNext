import { z } from 'zod';
import { DecisionIdSchema, RunIdSchema, WorkItemIdSchema } from './ids.js';

export const DecisionAlternativeSchema = z
  .object({
    label: z.string().min(1),
    description: z.string().min(1),
  })
  .strict();

export const DecisionSchema = z
  .object({
    decisionId: DecisionIdSchema,
    runId: RunIdSchema,
    workItemId: WorkItemIdSchema.optional(),
    question: z.string().min(1),
    alternatives: z.array(DecisionAlternativeSchema).optional(),
    recommendation: z.string().min(1).optional(),
    status: z.enum(['pending', 'resolved', 'superseded']),
    authority: z.enum(['main', 'user']),
    resolution: z.string().min(1).optional(),
  })
  .strict();

export type DecisionAlternative = z.infer<typeof DecisionAlternativeSchema>;
export type Decision = z.infer<typeof DecisionSchema>;
