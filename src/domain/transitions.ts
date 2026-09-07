import type { EvidenceKind, ReadinessLevel } from './acceptance.js';
import type { WorkItemState } from './work-item.js';

const allowedTransitions: Record<WorkItemState, readonly WorkItemState[]> = {
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

const readinessRank: Record<ReadinessLevel, number> = {
  implemented: 0,
  validated_local: 1,
  validated_target: 2,
  released: 3,
  accepted: 4,
};

export interface CompletionContext {
  requiredLevel: ReadinessLevel;
  achievedLevel: ReadinessLevel;
  requiredEvidenceKinds: EvidenceKind[];
  availableEvidenceKinds: EvidenceKind[];
  unresolvedRequiredDecision: boolean;
}

export function canTransition(from: WorkItemState, to: WorkItemState): boolean {
  return allowedTransitions[from].includes(to);
}

export function compareReadiness(
  left: ReadinessLevel,
  right: ReadinessLevel,
): number {
  return readinessRank[left] - readinessRank[right];
}

export function validateCompletion(
  context: CompletionContext,
): { ok: true } | { ok: false; reasons: string[] } {
  const reasons: string[] = [];

  if (compareReadiness(context.achievedLevel, context.requiredLevel) < 0) {
    reasons.push('required readiness level not achieved');
  }

  for (const kind of context.requiredEvidenceKinds) {
    if (!context.availableEvidenceKinds.includes(kind)) {
      reasons.push(`missing evidence kind: ${kind}`);
    }
  }

  if (context.unresolvedRequiredDecision) {
    reasons.push('required decision remains unresolved');
  }

  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}
