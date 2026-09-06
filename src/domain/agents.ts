import { z } from 'zod';

export const AgentRoleSchema = z.enum([
  'context_companion',
  'investigator',
  'builder',
  'specialist',
  'verifier',
  'docs_steward',
]);

export const ModelProfileSchema = z.enum([
  'efficient',
  'balanced',
  'deep',
  'critical',
]);

export type AgentRole = z.infer<typeof AgentRoleSchema>;
export type ModelProfile = z.infer<typeof ModelProfileSchema>;
