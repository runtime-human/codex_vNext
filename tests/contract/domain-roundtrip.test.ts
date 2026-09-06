import { describe, expect, it } from 'vitest';
import {
  AcceptanceSpecSchema,
  AgentRoleSchema,
  AuthorityEnvelopeSchema,
  EvidenceSchema,
  ModelProfileSchema,
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
