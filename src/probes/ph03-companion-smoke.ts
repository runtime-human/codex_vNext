import { z } from 'zod';

const OptionalObservedRuntimeMetadataSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .nullable();

export const Ph03CompanionSmokeEvidenceSchema = z
  .object({
    smokeVersion: z.literal(2),
    phase: z.literal('PH-03'),
    probe: z.literal('companion_live_smoke'),
    observedAt: z.string().datetime(),
    runtimeCommit: z.string().regex(/^[a-f0-9]{40}$/u),
    codexVersion: z.string().trim().min(1).max(128),
    hostSurface: z.enum(['cli', 'desktop']),
    workerHandoffSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    parentMarkerSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    worker: z
      .object({
        requestedRole: z.literal('context_companion'),
        runtimeRoleObserved: OptionalObservedRuntimeMetadataSchema,
        runtimeModelObserved: OptionalObservedRuntimeMetadataSchema,
        forkTurns: z.literal('none'),
        requestedAuthority: z.literal('read_only'),
        singleChildObserved: z.literal(true),
        freshThreadObserved: z.literal(true),
        parentMarkerVisible: z.literal(false),
        repoWritesObserved: z.literal(false),
      })
      .strict(),
    handoff: z
      .object({
        hydrationCapsuleValidated: z.literal(true),
        onlyHydrationCapsuleAndTaskPassed: z.literal(true),
        contextDeltaValidated: z.literal(true),
        contextDeltaItemCount: z.number().int().min(0).max(16),
        contextDeltaBytes: z.number().int().min(0).max(65_536),
        mainPersistedThroughContextIngestDelta: z.literal(true),
      })
      .strict(),
  })
  .strict();

export type Ph03CompanionSmokeEvidence = z.infer<
  typeof Ph03CompanionSmokeEvidenceSchema
>;

export function validatePh03CompanionSmoke(input: unknown): {
  status: 'PASS';
  evidence: Ph03CompanionSmokeEvidence;
} {
  return {
    status: 'PASS',
    evidence: Ph03CompanionSmokeEvidenceSchema.parse(input),
  };
}
