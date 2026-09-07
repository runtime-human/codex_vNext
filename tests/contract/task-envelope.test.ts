import { describe, expect, it } from 'vitest';
import { TaskDeltaSchema, TaskPacketSchema } from '../../src/domain/index.js';

const packet = {
  envelope: {
    envelopeVersion: 1,
    taskId: 'task-17',
    role: 'executor',
    objective: 'Add validation for workflow IDs',
    expectedOutcome: 'Invalid empty IDs are rejected by domain schemas',
    writableScope: ['src/domain/**', 'tests/contract/**'],
    protectedScope: ['.github/**'],
    constraints: ['Do not add persistence'],
    contextRefs: [
      {
        uri: 'CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#dom-06',
        summary: 'Task protocol',
      },
    ],
    relevantDecisions: [],
    acceptance: {
      requiredLevel: 'validated_local',
      criteria: ['domain tests pass'],
      requiredEvidenceKinds: ['test'],
    },
    authority: {
      write: 'bounded',
      network: 'none',
      destructive: false,
      mayCreateTests: true,
      maxRetries: 1,
    },
    returnContract: {
      mode: 'compact',
      includeEvidenceRefs: true,
      reportBlockersImmediately: true,
      intermediatePolicy: 'decision_changing_only',
    },
  },
  payload: {
    kind: 'implementation',
    changeIntent: ['add schema validation'],
    focusedChecks: ['npm test -- task-envelope'],
  },
} as const;

describe('task transfer contracts', () => {
  it('rejects bounded write with no writable scope', () => {
    expect(() =>
      TaskPacketSchema.parse({
        ...packet,
        envelope: { ...packet.envelope, writableScope: [] },
      }),
    ).toThrow(/bounded write authority/);
  });

  it('allows read-only context companion packet', () => {
    const contextPacket = {
      ...packet,
      envelope: {
        ...packet.envelope,
        role: 'context_companion',
        writableScope: [],
        authority: { ...packet.envelope.authority, write: 'none' },
      },
      payload: {
        kind: 'context',
        questions: ['Which modules own validation?'],
        scopes: ['src/domain/**'],
      },
    };

    expect(TaskPacketSchema.parse(contextPacket)).toEqual(contextPacket);
  });

  it('rejects verification payload for executor role', () => {
    expect(() =>
      TaskPacketSchema.parse({
        ...packet,
        payload: {
          kind: 'verification',
          claimsToVerify: ['IDs reject empty strings'],
          independenceRequired: true,
        },
      }),
    ).toThrow(/not valid for role/);
  });

  it('requires TaskDelta to contain a real change', () => {
    expect(() =>
      TaskDeltaSchema.parse({ deltaVersion: 1, taskId: 'task-17' }),
    ).toThrow(/at least one change/);
  });

  it('keeps native thread and runtime details outside the logical packet', () => {
    for (const field of ['nativeThreadId', 'fork_turns', 'effectiveModel']) {
      expect(() =>
        TaskPacketSchema.parse({
          ...packet,
          envelope: { ...packet.envelope, [field]: 'runtime-owned' },
        }),
      ).toThrow();
    }
  });

  it('does not expose a documentation role payload', () => {
    expect(() =>
      TaskPacketSchema.parse({
        ...packet,
        envelope: { ...packet.envelope, role: 'docs_steward' },
        payload: {
          kind: 'documentation',
          artifacts: ['README.md'],
          settledDecisionRefs: [],
        },
      }),
    ).toThrow();
  });

  it('round-trips a self-contained implementation packet', () => {
    expect(TaskPacketSchema.parse(packet)).toEqual(packet);
  });
});
