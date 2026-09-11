import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

const roots: string[] = [];

async function subject() {
  const modulePath: string =
    '../../src/probes/prepare-ph03-companion-smoke-cli.js';
  return (await import(modulePath)) as {
    preparePh03CompanionSmokeFiles(input: {
      runtimeCommit: string;
      codexVersion: string;
      hostSurface: 'cli' | 'desktop';
      hydrationCapsuleFile: string;
      outputDirectory: string;
      parentOnlyMarker?: string;
    }): Promise<{
      parentFile: string;
      workerFile: string;
      evidenceTemplateFile: string;
      parentOnlyMarker: string;
    }>;
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

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'workflow-ph03-prepare-'));
  roots.push(root);
  return root;
}

async function writeCapsule(root: string): Promise<string> {
  const capsuleFile = path.join(root, 'capsule.json');
  await writeFile(
    capsuleFile,
    `${JSON.stringify(hydrationCapsule(), null, 2)}\n`,
    'utf8',
  );
  return capsuleFile;
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('PH-03 Companion smoke preparation CLI', () => {
  it('writes an isolated single-child native-smoke bundle without leaking the parent sentinel', async () => {
    const { preparePh03CompanionSmokeFiles } = await subject();
    const root = await tempRoot();
    const capsuleFile = await writeCapsule(root);
    const outputDirectory = path.join(root, 'bundle');
    const parentOnlyMarker = 'PH03_PARENT_ONLY_TEST_a1b2c3d4';

    const result = await preparePh03CompanionSmokeFiles({
      runtimeCommit: 'd'.repeat(40),
      codexVersion: '0.153.4',
      hostSurface: 'desktop',
      hydrationCapsuleFile: capsuleFile,
      outputDirectory,
      parentOnlyMarker,
    });

    expect(result.parentOnlyMarker).toBe(parentOnlyMarker);
    expect(path.dirname(result.parentFile)).toBe(outputDirectory);
    expect(path.dirname(result.workerFile)).toBe(outputDirectory);
    expect(path.dirname(result.evidenceTemplateFile)).toBe(outputDirectory);

    const parent = JSON.parse(await readFile(result.parentFile, 'utf8')) as {
      packetVersion: number;
      parentOnlyMarker: string;
      launch: {
        requestedRole: string;
        forkTurns: string;
        requestedAuthority: string;
        singleChildOnly: boolean;
      };
    };
    const workerRaw = await readFile(result.workerFile, 'utf8');
    const evidence = JSON.parse(
      await readFile(result.evidenceTemplateFile, 'utf8'),
    ) as {
      smokeVersion: number;
      observedAt: unknown;
      worker: {
        requestedRole: string;
        runtimeRoleObserved: unknown;
        runtimeModelObserved: unknown;
        singleChildObserved: unknown;
        freshThreadObserved: unknown;
      };
    };

    expect(parent).toMatchObject({
      packetVersion: 2,
      parentOnlyMarker,
      launch: {
        requestedRole: 'context_companion',
        forkTurns: 'none',
        requestedAuthority: 'read_only',
        singleChildOnly: true,
      },
    });
    expect(workerRaw).not.toContain(parentOnlyMarker);
    expect(workerRaw).toContain('Do not spawn subagents.');
    expect(evidence).toMatchObject({
      smokeVersion: 2,
      observedAt: null,
      worker: {
        requestedRole: 'context_companion',
        runtimeRoleObserved: null,
        runtimeModelObserved: null,
        singleChildObserved: null,
        freshThreadObserved: null,
      },
    });
  });

  it('refuses to overwrite a previously prepared smoke bundle', async () => {
    const { preparePh03CompanionSmokeFiles } = await subject();
    const root = await tempRoot();
    const capsuleFile = await writeCapsule(root);
    const outputDirectory = path.join(root, 'bundle');
    const input = {
      runtimeCommit: 'd'.repeat(40),
      codexVersion: '0.153.4',
      hostSurface: 'desktop' as const,
      hydrationCapsuleFile: capsuleFile,
      outputDirectory,
      parentOnlyMarker: 'PH03_PARENT_ONLY_TEST_a1b2c3d4',
    };

    await preparePh03CompanionSmokeFiles(input);
    await expect(preparePh03CompanionSmokeFiles(input)).rejects.toBeDefined();
  });

  it('exposes a build-then-prepare npm command outside the default check gate', async () => {
    const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts['prepare:ph03-companion-smoke']).toBe(
      'npm run build && node ./dist/probes/prepare-ph03-companion-smoke-cli.js',
    );
    expect(packageJson.scripts.check).not.toContain(
      'prepare:ph03-companion-smoke',
    );
  });
});
