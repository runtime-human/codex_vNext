import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { canonicalJson } from '../../src/state/canonical-json.js';

const roots: string[] = [];

async function subject() {
  const modulePath: string =
    '../../src/probes/validate-ph03-companion-smoke-cli.js';
  return (await import(modulePath)) as {
    validatePh03CompanionSmokeFile(filePath: string): Promise<{
      status: 'PASS';
      evidence: unknown;
    }>;
    validatePh03CompanionSmokeBundle(
      evidenceFilePath: string,
      workerFilePath: string,
    ): Promise<{
      status: 'PASS';
      evidence: unknown;
    }>;
  };
}

async function tempFile(
  root: string,
  name: string,
  value: unknown,
): Promise<string> {
  const filePath = path.join(root, name);
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return filePath;
}

async function tempEvidence(value: unknown): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'workflow-ph03-smoke-cli-'));
  roots.push(root);
  return tempFile(root, 'evidence.json', value);
}

function hashWorker(worker: unknown): string {
  return createHash('sha256').update(canonicalJson(worker)).digest('hex');
}

function validEvidence(workerHandoffSha256 = 'b'.repeat(64)) {
  return {
    smokeVersion: 1,
    phase: 'PH-03',
    probe: 'companion_live_smoke',
    observedAt: '2026-09-11T05:00:00.000Z',
    runtimeCommit: 'a'.repeat(40),
    codexVersion: '0.153.4',
    hostSurface: 'cli',
    workerHandoffSha256,
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

  it('binds PASS evidence to the exact prepared worker handoff', async () => {
    const { validatePh03CompanionSmokeBundle } = await subject();
    const root = await mkdtemp(path.join(tmpdir(), 'workflow-ph03-smoke-cli-'));
    roots.push(root);
    const worker = {
      task: 'Return a bounded ContextDelta.',
      hydrationCapsule: { taskId: 'task-ph03-smoke' },
    };
    const workerFile = await tempFile(root, 'worker.json', worker);
    const evidenceFile = await tempFile(
      root,
      'evidence.json',
      validEvidence(hashWorker(worker)),
    );

    await expect(
      validatePh03CompanionSmokeBundle(evidenceFile, workerFile),
    ).resolves.toMatchObject({ status: 'PASS' });

    await writeFile(
      workerFile,
      `${JSON.stringify({ ...worker, task: 'tampered' }, null, 2)}\n`,
      'utf8',
    );
    await expect(
      validatePh03CompanionSmokeBundle(evidenceFile, workerFile),
    ).rejects.toThrow(/worker handoff digest mismatch/u);
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
