import { z } from 'zod';

export const ReadinessLevelSchema = z.enum([
  'implemented',
  'validated_local',
  'validated_target',
  'released',
  'accepted',
]);

export const EvidenceKindSchema = z.enum([
  'test',
  'build',
  'lint',
  'review',
  'git',
  'artifact',
  'source',
  'manual',
  'target_observation',
]);

export const AcceptanceSpecSchema = z
  .object({
    requiredLevel: ReadinessLevelSchema,
    criteria: z.array(z.string().min(1)).min(1),
    requiredEvidenceKinds: z.array(EvidenceKindSchema),
  })
  .strict();

export type ReadinessLevel = z.infer<typeof ReadinessLevelSchema>;
export type EvidenceKind = z.infer<typeof EvidenceKindSchema>;
export type AcceptanceSpec = z.infer<typeof AcceptanceSpecSchema>;
