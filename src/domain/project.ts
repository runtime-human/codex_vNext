import { z } from 'zod';
import { ProjectIdSchema } from './ids.js';

export const ProjectRefSchema = z
  .object({
    projectId: ProjectIdSchema,
    repoRoot: z.string().min(1),
    repoFingerprint: z.string().min(1).optional(),
    remoteUrl: z.string().min(1).optional(),
    defaultBranch: z.string().min(1).optional(),
  })
  .strict();

export type ProjectRef = z.infer<typeof ProjectRefSchema>;
