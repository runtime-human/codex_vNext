import { describe, expect, it } from 'vitest';

import { validatePh03CompanionSmoke } from '../../src/probes/ph03-companion-smoke.js';

async function subject() {
  const modulePath: string = '../../src/probes/prepare-ph03-companion-smoke.js';
  return (await import(modulePath)) as {
    createPh03CompanionSmokeArtifacts(input: {
      runtimeCommit: string;
      codexVersion: string;
      hostSurface: 'cli' | 'desktop';
      parentOnlyMarker: string;
      hydrationCapsule: unknown;
    }): {
      parent: unknown;
      worker: unknown;
      evidenceTemplate: unknown;
    };
  };
}

function hydrationCapsule() {
  return {
    capsuleVersion: 1,
    taskId: 'task-ph03-smoke',
    projectId: 'project-ph03-smoke',
    runId: 'run-ph03-smoke',
    objective: 'Validate a fresh read-only Context Companion handoff.',
    repoHead: 'a'.repeat(40),
    contextItems: [],
    relevantDecisionIds: [],
    evidenceIds: [],
    unresolvedQuestions: [],
  };
}

describe('PH-03 native Companion smoke packet', () => {
  it('keeps the parent-only marker out of the exact worker handoff', async () => {
    const { createPh03CompanionSmokeArtifacts } = await subject();
    const parentOnlyMarker = 'PH03_PARENT_ONLY_TEST_7f31d5f3';

    const artifacts = createPh03CompanionSmokeArtifacts({
      runtimeCommit: 'b'.repeat(40),
      codexVersion: '0.153.4',
      hostSurface: 'cli',
      parentOnlyMarker,
      hydrationCapsule: hydrationCapsule(),
    }) as {
      parent: {
        parentOnlyMarker: string;
        launch: {
          role: string;
          forkTurns: string;
          authority: string;
        };
      };
      worker: Record<string, unknown>;
      evidenceTemplate: unknown;
    };

    expect(artifacts.parent).toMatchObject({
      parentOnlyMarker,
      launch: {
        role: 'context_companion',
        forkTurns: 'none',
        authority: 'read_only',
      },
    });
    expect(Object.keys(artifacts.worker).sort()).toEqual([
      'hydrationCapsule',
      'task',
    ]);
    expect(JSON.stringify(artifacts.worker)).not.toContain(parentOnlyMarker);
  });

  it('produces a fail-closed evidence template until native observations are filled', async () => {
    const { createPh03CompanionSmokeArtifacts } = await subject();
    const artifacts = createPh03CompanionSmokeArtifacts({
      runtimeCommit: 'c'.repeat(40),
      codexVersion: '0.153.4',
      hostSurface: 'desktop',
      parentOnlyMarker: 'PH03_PARENT_ONLY_TEST_4b2c1d90',
      hydrationCapsule: hydrationCapsule(),
    });

    expect(() =>
      validatePh03CompanionSmoke(artifacts.evidenceTemplate),
    ).toThrow();
  });
});
