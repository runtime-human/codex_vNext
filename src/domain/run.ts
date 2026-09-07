import { z } from 'zod';
import { ProjectIdSchema, RunIdSchema } from './ids.js';

export const WorkflowRunSchema = z
  .object({
    runId: RunIdSchema,
    projectId: ProjectIdSchema,
    objective: z.string().min(1),
    state: z.enum(['active', 'paused', 'blocked', 'completed', 'cancelled']),
    durable: z.boolean(),
    primaryThreadId: z.string().min(1).optional(),
    startedAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export type WorkflowRun = z.infer<typeof WorkflowRunSchema>;
