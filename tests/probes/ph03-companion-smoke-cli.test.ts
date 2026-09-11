import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

const roots: string[] = [];

async function subject() {
  const modulePath: string =
    '../../src/probes/validate-ph03-companion-smoke-cli.js';
  return (await import(modulePath)) as {
    validatePh03CompanionSmokeFile(filePath: string): Promise<{
      status: 'PASS';
      evidence: unknown;
    }>;
  };
}

async function tempEvidence(value: unknown): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'workflow-ph03-smoke-cli-'));
  roots.push(root);
  const filePath = path.join(root, 'evidence.json');
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return filePath;
}

function validEvidence() {
  return {
    smokeVersion: 1,
    phase: 'PH-03',
    probe: 'companion_live_smoke',
    observedAt: '2026-09-11T05:00:00.000Z',
    runtimeCommit: 'a'.repeat(40),
    codexVersion: '0.153.4',
    hostSurface: 'cli',
    worker: {
      role: 'context_companion',
      forkTurns: 'none',
      authority: 'read_only',
      freshThreadObserved: true,
      parentMarkerVisible: false,
      repoWritesObserved: false,
    },
    handoff: {
      hydrationCapsuleValidated: true,
      onlyHydrationCapsuleAndTaskPassed: true,
      contextDeltaValidated: true,
      contextDeltaItemCount: 2,
      contextDeltaBytes: 900,
      mainPersistedThroughContextIngestDelta: true,
    },
  };
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('PH-03 Companion smoke CLI validator', () => {
  it('validates a real PASS-shaped evidence file', async () => {
    const { validatePh03CompanionSmokeFile } = await subject();
    const filePath = await tempEvidence(validEvidence());
    await expect(
      validatePh03CompanionSmokeFile(filePath),
    ).resolves.toMatchObject({
      status: 'PASS',
    });
  });

  it('rejects PARTIAL or malformed evidence instead of promoting it', async () => {
    const { validatePh03CompanionSmokeFile } = await subject();
    const filePath = await tempEvidence({
      phase: 'PH-03',
      status: 'PARTIAL',
      observations: { forkTurnsNone: 'unobserved' },
    });
    await expect(
      validatePh03CompanionSmokeFile(filePath),
    ).rejects.toBeDefined();
  });

  it('exposes a build-then-validate npm command without entering the default check gate', async () => {
    const packageJson = JSON.parse(
      await import('node:fs/promises').then(({ readFile }) =>
        readFile('package.json', 'utf8'),
      ),
    ) as { scripts: Record<string, string> };

    expect(packageJson.scripts['validate:ph03-companion-smoke']).toBe(
      'npm run build && node ./dist/probes/validate-ph03-companion-smoke-cli.js',
    );
    expect(packageJson.scripts.check).not.toContain(
      'validate:ph03-companion-smoke',
    );
  });
});
