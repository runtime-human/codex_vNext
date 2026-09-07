import { z } from 'zod';
import { AgentRoleSchema } from './agents.js';
import { TaskIdSchema } from './ids.js';

export const SandboxModeSchema = z.enum([
  'inherit',
  'read-only',
  'workspace-write',
]);

export const NonDefaultModelPolicySchema = z.enum([
  'disabled',
  'explicit_only',
]);

export const AgentRuntimeProfileSchema = z
  .object({
    role: AgentRoleSchema,
    enabled: z.boolean(),
    model: z.string().min(1),
    reasoningEffort: z.string().min(1),
    sandboxMode: SandboxModeSchema,
  })
  .strict();

const DefaultSubagentSchema = z
  .object({
    model: z.string().min(1),
    reasoningEffort: z.string().min(1),
  })
  .strict();

export const AgentProfileSetSchema = z
  .object({
    defaultSubagent: DefaultSubagentSchema,
    maxConcurrentThreads: z.number().int().min(1).max(20),
    nonDefaultModelPolicy: NonDefaultModelPolicySchema,
    allowedModels: z.array(z.string().min(1)).min(1),
    profiles: z
      .object({
        context_companion: AgentRuntimeProfileSchema,
        investigator: AgentRuntimeProfileSchema,
        executor: AgentRuntimeProfileSchema,
        senior_executor: AgentRuntimeProfileSchema,
        verifier: AgentRuntimeProfileSchema,
      })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    for (const [role, profile] of Object.entries(value.profiles)) {
      if (profile.role !== role) {
        context.addIssue({
          code: 'custom',
          path: ['profiles', role, 'role'],
          message: `profile role ${profile.role} does not match key ${role}`,
        });
      }

      if (!value.allowedModels.includes(profile.model)) {
        context.addIssue({
          code: 'custom',
          path: ['profiles', role, 'model'],
          message: `model ${profile.model} is not allowlisted`,
        });
      }

      if (
        value.nonDefaultModelPolicy === 'disabled' &&
        profile.model !== value.defaultSubagent.model
      ) {
        context.addIssue({
          code: 'custom',
          path: ['profiles', role, 'model'],
          message: 'non-default models require explicit_only policy',
        });
      }

      if (
        profile.model === 'gpt-5.6-luna' &&
        !['xhigh', 'max'].includes(profile.reasoningEffort)
      ) {
        context.addIssue({
          code: 'custom',
          path: ['profiles', role, 'reasoningEffort'],
          message: 'Luna profiles require xhigh or max reasoning effort',
        });
      }
    }
  });

export const DEFAULT_AGENT_PROFILE_SET: z.infer<typeof AgentProfileSetSchema> =
  {
    defaultSubagent: {
      model: 'gpt-5.6-luna',
      reasoningEffort: 'xhigh',
    },
    maxConcurrentThreads: 4,
    nonDefaultModelPolicy: 'disabled',
    allowedModels: ['gpt-5.6-luna'],
    profiles: {
      context_companion: {
        role: 'context_companion',
        enabled: true,
        model: 'gpt-5.6-luna',
        reasoningEffort: 'xhigh',
        sandboxMode: 'read-only',
      },
      investigator: {
        role: 'investigator',
        enabled: true,
        model: 'gpt-5.6-luna',
        reasoningEffort: 'xhigh',
        sandboxMode: 'read-only',
      },
      executor: {
        role: 'executor',
        enabled: true,
        model: 'gpt-5.6-luna',
        reasoningEffort: 'max',
        sandboxMode: 'workspace-write',
      },
      senior_executor: {
        role: 'senior_executor',
        enabled: true,
        model: 'gpt-5.6-luna',
        reasoningEffort: 'max',
        sandboxMode: 'workspace-write',
      },
      verifier: {
        role: 'verifier',
        enabled: true,
        model: 'gpt-5.6-luna',
        reasoningEffort: 'xhigh',
        sandboxMode: 'workspace-write',
      },
    },
  };

export const DelegationIntentSchema = z
  .object({
    taskId: TaskIdSchema,
    role: AgentRoleSchema,
    reasonCodes: z.array(z.string().min(1)).min(1),
    freshContext: z.literal(true),
    batchKey: z.string().min(1).optional(),
  })
  .strict();

export const ResolvedAgentRuntimeSchema = z
  .object({
    role: AgentRoleSchema,
    model: z.string().min(1),
    reasoningEffort: z.string().min(1),
    sandboxMode: SandboxModeSchema,
    source: z.enum([
      'builtin_default',
      'user_config',
      'project_config',
      'session_override',
    ]),
  })
  .strict();

export type SandboxMode = z.infer<typeof SandboxModeSchema>;
export type NonDefaultModelPolicy = z.infer<typeof NonDefaultModelPolicySchema>;
export type AgentRuntimeProfile = z.infer<typeof AgentRuntimeProfileSchema>;
export type AgentProfileSet = z.infer<typeof AgentProfileSetSchema>;
export type DelegationIntent = z.infer<typeof DelegationIntentSchema>;
export type ResolvedAgentRuntime = z.infer<typeof ResolvedAgentRuntimeSchema>;
