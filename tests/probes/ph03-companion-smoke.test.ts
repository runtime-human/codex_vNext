import { describe, expect, it } from 'vitest';

async function subject() {
  const modulePath: string = '../../src/probes/ph03-companion-smoke.js';
  return (await import(modulePath)) as {
    validatePh03CompanionSmoke(input: unknown): {
      status: 'PASS' | 'FAIL';
      evidence: unknown;
    };
  };
}

function validEvidence() {
  return {
    smokeVersion: 2,
    phase: 'PH-03',
    probe: 'companion_live_smoke',
    observedAt: '2026-09-11T05:00:00.000Z',
    runtimeCommit: 'a'.repeat(40),
    codexVersion: '0.153.4',
    hostSurface: 'cli',
    workerHandoffSha256: 'b'.repeat(64),
    parentMarkerSha256: 'c'.repeat(64),
    worker: {
      requestedRole: 'context_companion',
      runtimeRoleObserved: null,
      runtimeModelObserved: null,
      forkTurns: 'none',
      requestedAuthority: 'read_only',
      singleChildObserved: true,
      freshThreadObserved: true,
      parentMarkerVisible: false,
      repoWritesObserved: false,
    },
    handoff: {
      hydrationCapsuleValidated: true,
      onlyHydrationCapsuleAndTaskPassed: true,
      contextDeltaValidated: true,
      contextDeltaItemCount: 3,
      contextDeltaBytes: 1200,
      mainPersistedThroughContextIngestDelta: true,
    },
  };
}

describe('PH-03 live Companion smoke evidence', () => {
  it('accepts only fully observed isolation evidence as PASS without inventing runtime role provenance', async () => {
    const { validatePh03CompanionSmoke } = await subject();
    const result = validatePh03CompanionSmoke(validEvidence());
    expect(result.status).toBe('PASS');
    expect(result.evidence).toMatchObject({
      worker: {
        requestedRole: 'context_companion',
        runtimeRoleObserved: null,
        runtimeModelObserved: null,
      },
    });
  });

  it('requires SHA-256 bindings to both worker handoff and parent marker', async () => {
    const { validatePh03CompanionSmoke } = await subject();
    const {
      workerHandoffSha256: _workerHandoffSha256,
      ...withoutWorkerBinding
    } = validEvidence();
    expect(() => validatePh03CompanionSmoke(withoutWorkerBinding)).toThrow();

    const { parentMarkerSha256: _parentMarkerSha256, ...withoutParentBinding } =
      validEvidence();
    expect(() => validatePh03CompanionSmoke(withoutParentBinding)).toThrow();
  });

  it.each([
    [
      'forkTurns',
      (value: ReturnType<typeof validEvidence>) => {
        value.worker.forkTurns = 'full';
      },
    ],
    [
      'requested authority',
      (value: ReturnType<typeof validEvidence>) => {
        value.worker.requestedAuthority = 'write';
      },
    ],
    [
      'single-child execution',
      (value: ReturnType<typeof validEvidence>) => {
        value.worker.singleChildObserved = false;
      },
    ],
    [
      'parent marker',
      (value: ReturnType<typeof validEvidence>) => {
        value.worker.parentMarkerVisible = true;
      },
    ],
    [
      'repo writes',
      (value: ReturnType<typeof validEvidence>) => {
        value.worker.repoWritesObserved = true;
      },
    ],
    [
      'fresh thread',
      (value: ReturnType<typeof validEvidence>) => {
        value.worker.freshThreadObserved = false;
      },
    ],
    [
      'capsule',
      (value: ReturnType<typeof validEvidence>) => {
        value.handoff.hydrationCapsuleValidated = false;
      },
    ],
    [
      'bounded handoff',
      (value: ReturnType<typeof validEvidence>) => {
        value.handoff.onlyHydrationCapsuleAndTaskPassed = false;
      },
    ],
    [
      'delta validation',
      (value: ReturnType<typeof validEvidence>) => {
        value.handoff.contextDeltaValidated = false;
      },
    ],
    [
      'persistence path',
      (value: ReturnType<typeof validEvidence>) => {
        value.handoff.mainPersistedThroughContextIngestDelta = false;
      },
    ],
  ])('fails closed when %s is not proven', async (_name, mutate) => {
    const { validatePh03CompanionSmoke } = await subject();
    const evidence = validEvidence();
    mutate(evidence);
    expect(() => validatePh03CompanionSmoke(evidence)).toThrow();
  });

  it('rejects unbounded or fabricated evidence shape', async () => {
    const { validatePh03CompanionSmoke } = await subject();
    expect(() =>
      validatePh03CompanionSmoke({
        ...validEvidence(),
        extraClaim: 'trust me',
      }),
    ).toThrow();
    expect(() =>
      validatePh03CompanionSmoke({
        ...validEvidence(),
        handoff: {
          ...validEvidence().handoff,
          contextDeltaItemCount: 17,
        },
      }),
    ).toThrow();
  });
});
