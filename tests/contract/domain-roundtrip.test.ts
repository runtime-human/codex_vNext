import { describe, expect, it } from 'vitest';
import {
  AcceptanceSpecSchema,
  AgentProfileSetSchema,
  AgentRoleSchema,
  AuthorityEnvelopeSchema,
  ContextItemSchema,
  DEFAULT_AGENT_PROFILE_SET,
  DecisionSchema,
  DelegationIntentSchema,
  EvidenceSchema,
  PolicyTraceSchema,
  ProjectRefSchema,
  ResolvedAgentRuntimeSchema,
  WorkflowRunSchema,
  WorkItemSchema,
} from '../../src/domain/index.js';

describe('core domain contracts', () => {
  it('accepts exactly the five semantic worker roles', () => {
    const roles = [
      'context_companion',
      'investigator',
      'executor',
      'senior_executor',
      'verifier',
    ] as const;

    expect(roles.map((role) => AgentRoleSchema.parse(role))).toEqual(roles);
    for (const obsoleteRole of ['builder', 'specialist', 'docs_steward']) {
      expect(() => AgentRoleSchema.parse(obsoleteRole)).toThrow();
    }
  });

  it('freezes the safe Luna-only default profile set', () => {
    const profiles = AgentProfileSetSchema.parse(DEFAULT_AGENT_PROFILE_SET);

    expect(profiles.defaultSubagent).toEqual({
      model: 'gpt-5.6-luna',
      reasoningEffort: 'xhigh',
    });
    expect(profiles.maxConcurrentThreads).toBe(4);
    expect(profiles.nonDefaultModelPolicy).toBe('disabled');
    expect(profiles.allowedModels).toEqual(['gpt-5.6-luna']);
    expect(
      Object.fromEntries(
        Object.entries(profiles.profiles).map(([role, profile]) => [
          role,
          [profile.model, profile.reasoningEffort, profile.sandboxMode],
        ]),
      ),
    ).toEqual({
      context_companion: ['gpt-5.6-luna', 'xhigh', 'read-only'],
      investigator: ['gpt-5.6-luna', 'xhigh', 'read-only'],
      executor: ['gpt-5.6-luna', 'max', 'workspace-write'],
      senior_executor: ['gpt-5.6-luna', 'max', 'workspace-write'],
      verifier: ['gpt-5.6-luna', 'xhigh', 'workspace-write'],
    });
    expect(profiles.profiles.senior_executor.role).not.toBe('executor');
  });

  it('keeps the Main model outside the child profile contract', () => {
    expect(() =>
      AgentProfileSetSchema.parse({
        ...DEFAULT_AGENT_PROFILE_SET,
        main: { model: 'gpt-6-astra', reasoningEffort: 'ultra' },
      }),
    ).toThrow();
  });

  it('rejects unsafe Luna effort and silent non-default models', () => {
    const lowLuna = structuredClone(DEFAULT_AGENT_PROFILE_SET);
    lowLuna.profiles.verifier.reasoningEffort = 'high';
    expect(() => AgentProfileSetSchema.parse(lowLuna)).toThrow();

    const silentSol = structuredClone(DEFAULT_AGENT_PROFILE_SET);
    silentSol.profiles.senior_executor.model = 'gpt-5.6-sol';
    expect(() => AgentProfileSetSchema.parse(silentSol)).toThrow();

    const mismatchedRole = structuredClone(DEFAULT_AGENT_PROFILE_SET);
    mismatchedRole.profiles.verifier.role = 'executor';
    expect(() => AgentProfileSetSchema.parse(mismatchedRole)).toThrow();
  });

  it('allows an explicit allowlisted Sol senior mapping', () => {
    const configured = structuredClone(DEFAULT_AGENT_PROFILE_SET);
    configured.nonDefaultModelPolicy = 'explicit_only';
    configured.allowedModels.push('gpt-5.6-sol');
    configured.profiles.senior_executor.model = 'gpt-5.6-sol';
    configured.profiles.senior_executor.reasoningEffort = 'medium';

    expect(
      AgentProfileSetSchema.parse(configured).profiles.senior_executor.model,
    ).toBe('gpt-5.6-sol');
  });

  it('keeps delegation intent separate from resolved runtime', () => {
    const intent = {
      taskId: 'task-1',
      role: 'senior_executor',
      reasonCodes: ['difficult_bounded_implementation'],
      freshContext: true,
    } as const;
    const runtime = {
      role: 'senior_executor',
      model: 'gpt-5.6-luna',
      reasoningEffort: 'max',
      sandboxMode: 'workspace-write',
      source: 'builtin_default',
    } as const;

    expect(DelegationIntentSchema.parse(intent)).toEqual(intent);
    expect(ResolvedAgentRuntimeSchema.parse(runtime)).toEqual(runtime);
    expect(() =>
      DelegationIntentSchema.parse({ ...intent, reasonCodes: [] }),
    ).toThrow();
    expect(() =>
      ResolvedAgentRuntimeSchema.parse({
        ...runtime,
        effectiveModel: 'gpt-5.6-luna',
      }),
    ).toThrow();
  });

  it('rejects excessive retry budgets', () => {
    expect(() =>
      AuthorityEnvelopeSchema.parse({
        write: 'none',
        network: 'none',
        destructive: false,
        mayCreateTests: false,
        maxRetries: 11,
      }),
    ).toThrow();
  });

  it('rejects runtime selection fields in authority', () => {
    expect(() =>
      AuthorityEnvelopeSchema.parse({
        write: 'none',
        network: 'none',
        destructive: false,
        mayCreateTests: false,
        maxRetries: 1,
        preferredProfile: 'balanced',
      }),
    ).toThrow();
  });

  it('requires at least one acceptance criterion', () => {
    expect(() =>
      AcceptanceSpecSchema.parse({
        requiredLevel: 'validated_local',
        criteria: [],
        requiredEvidenceKinds: ['test'],
      }),
    ).toThrow();
  });

  it('round-trips evidence without adding fields', () => {
    const value = {
      evidenceId: 'ev-1',
      kind: 'test',
      summary: 'unit suite',
      status: 'pass',
      createdAt: '2026-09-06T00:00:00Z',
    };

    expect(EvidenceSchema.parse(value)).toEqual(value);
  });
});

describe('workflow state contracts', () => {
  it('strictly parses a project reference', () => {
    const value = {
      projectId: 'project-1',
      repoRoot: 'C:/repo',
      defaultBranch: 'main',
    };

    expect(ProjectRefSchema.parse(value)).toEqual(value);
    expect(() =>
      ProjectRefSchema.parse({ ...value, unexpected: true }),
    ).toThrow();
  });

  it('accepts workflow run states and rejects unknown states', () => {
    const run = {
      runId: 'run-1',
      projectId: 'project-1',
      objective: 'Implement domain contracts',
      state: 'active',
      durable: false,
      startedAt: '2026-09-07T00:00:00Z',
      updatedAt: '2026-09-07T00:01:00Z',
    };

    expect(WorkflowRunSchema.parse(run)).toEqual(run);
    expect(() => WorkflowRunSchema.parse({ ...run, state: 'ready' })).toThrow();
  });

  it('requires a positive integer work item version', () => {
    const item = {
      workItemId: 'work-1',
      runId: 'run-1',
      title: 'Domain V1',
      objective: 'Freeze state contracts',
      state: 'ready',
      risk: 'medium',
      version: 1,
    };

    expect(WorkItemSchema.parse(item)).toEqual(item);
    expect(() => WorkItemSchema.parse({ ...item, version: 0 })).toThrow();
    expect(() => WorkItemSchema.parse({ ...item, version: 1.5 })).toThrow();
  });

  it('round-trips a decision with strict alternatives', () => {
    const decision = {
      decisionId: 'decision-1',
      runId: 'run-1',
      question: 'Which contract shape should be frozen?',
      alternatives: [
        { label: 'Strict object', description: 'Named option with rationale' },
      ],
      recommendation: 'Strict object',
      status: 'pending',
      authority: 'user',
    };

    expect(DecisionSchema.parse(decision)).toEqual(decision);
    expect(() =>
      DecisionSchema.parse({
        ...decision,
        alternatives: [
          { label: 'Strict object', description: 'Valid', extra: true },
        ],
      }),
    ).toThrow();
  });

  it('preserves explicit stale context state', () => {
    const context = {
      contextId: 'context-1',
      projectId: 'project-1',
      kind: 'source_pointer',
      scope: 'src/domain/**',
      summary: 'Domain source',
      sourceUri: 'src/domain/index.ts',
      verifiedAt: '2026-09-07T00:00:00Z',
      stale: true,
    };

    expect(ContextItemSchema.parse(context)).toEqual(context);
  });

  it('strictly records auditable policy trace signals', () => {
    const trace = {
      traceVersion: 1,
      decision: 'delegate',
      signals: ['independent verification adds value'],
      capabilities: ['verifier'],
      reasons: ['medium-risk contract change'],
    };

    expect(PolicyTraceSchema.parse(trace)).toEqual(trace);
    expect(() =>
      PolicyTraceSchema.parse({ ...trace, hiddenReasoning: true }),
    ).toThrow();
  });
});
