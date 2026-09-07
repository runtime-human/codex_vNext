import { z } from 'zod';
import { AgentRoleSchema } from './agents.js';
import { RunIdSchema, WorkItemIdSchema } from './ids.js';

export const WorkItemStateSchema = z.enum([
  'ready',
  'running',
  'verifying',
  'needs_decision',
  'needs_review',
  'blocked',
  'done',
  'cancelled',
]);

export const WorkItemSchema = z
  .object({
    workItemId: WorkItemIdSchema,
    runId: RunIdSchema,
    title: z.string().min(1),
    objective: z.string().min(1),
    state: WorkItemStateSchema,
    risk: z.enum(['low', 'medium', 'high', 'critical']),
    ownerRole: AgentRoleSchema.optional(),
    nativeThreadId: z.string().min(1).optional(),
    worktreeRef: z.string().min(1).optional(),
    version: z.number().int().positive(),
  })
  .strict();

export type WorkItemState = z.infer<typeof WorkItemStateSchema>;
export type WorkItem = z.infer<typeof WorkItemSchema>;
