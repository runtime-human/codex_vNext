import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { createPh03CompanionSmokeArtifacts } from './prepare-ph03-companion-smoke.js';

export interface PreparePh03CompanionSmokeFilesInput {
  runtimeCommit: string;
  codexVersion: string;
  hostSurface: 'cli' | 'desktop';
  hydrationCapsuleFile: string;
  outputDirectory: string;
  parentOnlyMarker?: string;
}

export interface PreparePh03CompanionSmokeFilesResult {
  parentFile: string;
  workerFile: string;
  evidenceTemplateFile: string;
  parentOnlyMarker: string;
}

function generatedParentOnlyMarker(): string {
  return `PH03_PARENT_ONLY_${randomBytes(12).toString('hex')}`;
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export async function preparePh03CompanionSmokeFiles(
  input: PreparePh03CompanionSmokeFilesInput,
): Promise<PreparePh03CompanionSmokeFilesResult> {
  const hydrationCapsuleFile = path.resolve(input.hydrationCapsuleFile);
  const outputDirectory = path.resolve(input.outputDirectory);
  const hydrationCapsule = JSON.parse(
    await readFile(hydrationCapsuleFile, 'utf8'),
  ) as unknown;
  const parentOnlyMarker =
    input.parentOnlyMarker ?? generatedParentOnlyMarker();
  const artifacts = createPh03CompanionSmokeArtifacts({
    runtimeCommit: input.runtimeCommit,
    codexVersion: input.codexVersion,
    hostSurface: input.hostSurface,
    parentOnlyMarker,
    hydrationCapsule,
  });

  await mkdir(outputDirectory, { recursive: true });
  const parentFile = path.join(outputDirectory, 'parent.json');
  const workerFile = path.join(outputDirectory, 'worker.json');
  const evidenceTemplateFile = path.join(
    outputDirectory,
    'evidence-template.json',
  );

  await Promise.all([
    writeJson(parentFile, artifacts.parent),
    writeJson(workerFile, artifacts.worker),
    writeJson(evidenceTemplateFile, artifacts.evidenceTemplate),
  ]);

  return {
    parentFile,
    workerFile,
    evidenceTemplateFile,
    parentOnlyMarker,
  };
}

async function main(): Promise<void> {
  const [
    runtimeCommit,
    codexVersion,
    hostSurface,
    hydrationCapsuleFile,
    outputDirectory,
    parentOnlyMarker,
  ] = process.argv.slice(2);

  if (
    !runtimeCommit ||
    !codexVersion ||
    (hostSurface !== 'cli' && hostSurface !== 'desktop') ||
    !hydrationCapsuleFile ||
    !outputDirectory
  ) {
    throw new Error(
      'usage: npm run prepare:ph03-companion-smoke -- <runtimeCommit> <codexVersion> <cli|desktop> <hydrationCapsule.json> <outputDir> [parentOnlyMarker]',
    );
  }

  const result = await preparePh03CompanionSmokeFiles({
    runtimeCommit,
    codexVersion,
    hostSurface,
    hydrationCapsuleFile,
    outputDirectory,
    ...(parentOnlyMarker ? { parentOnlyMarker } : {}),
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

const entryPoint = process.argv[1];
if (entryPoint && import.meta.url === pathToFileURL(entryPoint).href) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'invalid input';
    process.stderr.write(
      `PH03_COMPANION_SMOKE_PREPARE_INVALID: ${message.slice(0, 1000)}\n`,
    );
    process.exitCode = 1;
  });
}
