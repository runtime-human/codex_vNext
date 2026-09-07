import { describe, expect, it } from 'vitest';
import {
  canTransition,
  compareReadiness,
  validateCompletion,
  type WorkItemState,
} from '../../src/domain/index.js';

const states: WorkItemState[] = [
  'ready',
  'running',
  'verifying',
  'needs_decision',
  'needs_review',
  'blocked',
  'done',
  'cancelled',
];

const allowed: Record<WorkItemState, WorkItemState[]> = {
  ready: ['running', 'cancelled'],
  running: [
    'verifying',
    'needs_decision',
    'needs_review',
    'blocked',
    'cancelled',
  ],
  verifying: [
    'running',
    'needs_decision',
    'needs_review',
    'blocked',
    'done',
    'cancelled',
  ],
  needs_decision: ['ready', 'running', 'blocked', 'cancelled'],
  needs_review: ['running', 'verifying', 'blocked', 'done', 'cancelled'],
  blocked: ['ready', 'running', 'cancelled'],
  done: [],
  cancelled: [],
};

describe('work item transitions', () => {
  it('matches every edge in the frozen transition matrix', () => {
    for (const from of states) {
      for (const to of states) {
        expect(canTransition(from, to), `${from} -> ${to}`).toBe(
          allowed[from].includes(to),
        );
      }
    }
  });
});

describe('completion validation', () => {
  it('orders readiness levels explicitly', () => {
    expect(compareReadiness('implemented', 'validated_local')).toBeLessThan(0);
    expect(compareReadiness('validated_target', 'validated_target')).toBe(0);
    expect(compareReadiness('accepted', 'released')).toBeGreaterThan(0);
  });

  it('rejects validated_local when validated_target is required', () => {
    expect(
      validateCompletion({
        requiredLevel: 'validated_target',
        achievedLevel: 'validated_local',
        requiredEvidenceKinds: [],
        availableEvidenceKinds: [],
        unresolvedRequiredDecision: false,
      }),
    ).toEqual({
      ok: false,
      reasons: ['required readiness level not achieved'],
    });
  });

  it('rejects missing required evidence kind', () => {
    expect(
      validateCompletion({
        requiredLevel: 'validated_local',
        achievedLevel: 'validated_local',
        requiredEvidenceKinds: ['test', 'review'],
        availableEvidenceKinds: ['test'],
        unresolvedRequiredDecision: false,
      }),
    ).toEqual({ ok: false, reasons: ['missing evidence kind: review'] });
  });

  it('rejects unresolved required decision', () => {
    expect(
      validateCompletion({
        requiredLevel: 'implemented',
        achievedLevel: 'implemented',
        requiredEvidenceKinds: [],
        availableEvidenceKinds: [],
        unresolvedRequiredDecision: true,
      }),
    ).toEqual({ ok: false, reasons: ['required decision remains unresolved'] });
  });

  it('accepts completion when level and evidence satisfy contract', () => {
    expect(
      validateCompletion({
        requiredLevel: 'validated_local',
        achievedLevel: 'validated_target',
        requiredEvidenceKinds: ['test'],
        availableEvidenceKinds: ['test', 'build'],
        unresolvedRequiredDecision: false,
      }),
    ).toEqual({ ok: true });
  });
});
