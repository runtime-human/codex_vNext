import { describe, expect, it } from 'vitest';
import {
  AcceptanceSpecSchema,
  AgentRoleSchema,
  AuthorityEnvelopeSchema,
  ContextItemSchema,
  DecisionSchema,
  EvidenceSchema,
  ModelProfileSchema,
  PolicyTraceSchema,
  ProjectRefSchema,
  WorkflowRunSchema,
  WorkItemSchema,
} from '../../src/domain/index.js';

describe('core domain contracts', () => {
  it('accepts stable semantic roles and profiles', () => {
    expect(AgentRoleSchema.parse('builder')).toBe('builder');
    expect(ModelProfileSchema.parse('balanced')).toBe('balanced');
  });

  it('rejects excessive retry budgets', () => {
    expect(() =>
      AuthorityEnvelopeSchema.parse({
        write: 'none',
        network: 'none',
        destructive: false,
        mayCreateTests: false,
        maxRetries: 11,
        preferredProfile: 'efficient',
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
