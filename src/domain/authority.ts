import { z } from 'zod';
import { ModelProfileSchema } from './agents.js';

export const AuthorityEnvelopeSchema = z
  .object({
    write: z.enum(['none', 'bounded']),
    network: z.enum(['inherit', 'none', 'bounded']),
    destructive: z.boolean(),
    mayCreateTests: z.boolean(),
    maxRetries: z.number().int().min(0).max(10),
    preferredProfile: ModelProfileSchema,
    allowEscalationTo: ModelProfileSchema.optional(),
  })
  .strict();

export type AuthorityEnvelope = z.infer<typeof AuthorityEnvelopeSchema>;
