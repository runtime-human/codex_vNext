import { z } from 'zod';

export const AgentRoleSchema = z.enum([
  'context_companion',
  'investigator',
  'executor',
  'senior_executor',
  'verifier',
]);

export type AgentRole = z.infer<typeof AgentRoleSchema>;
