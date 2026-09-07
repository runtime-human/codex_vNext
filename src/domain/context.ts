import { z } from 'zod';
import { ContextIdSchema, ProjectIdSchema } from './ids.js';

export const ContextItemSchema = z
  .object({
    contextId: ContextIdSchema,
    projectId: ProjectIdSchema,
    kind: z.enum([
      'module_summary',
      'source_pointer',
      'test_pointer',
      'decision_pointer',
      'history_pointer',
      'pitfall',
      'dependency_pointer',
    ]),
    scope: z.string().min(1),
    summary: z.string().min(1),
    sourceUri: z.string().min(1),
    sourceHash: z.string().min(1).optional(),
    gitSha: z.string().min(1).optional(),
    verifiedAt: z.string().datetime(),
    stale: z.boolean(),
  })
  .strict();

export type ContextItem = z.infer<typeof ContextItemSchema>;
