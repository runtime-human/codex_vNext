import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { canonicalJson } from '../state/canonical-json.js';
import { validatePh03CompanionSmoke } from './ph03-companion-smoke.js';

export async function validatePh03CompanionSmokeFile(filePath: string) {
  if (!filePath.trim()) throw new Error('evidence file path is required');
  const raw = await readFile(filePath, 'utf8');
  return validatePh03CompanionSmoke(JSON.parse(raw) as unknown);
}

export async function validatePh03CompanionSmokeBundle(
  evidenceFilePath: string,
  workerFilePath: string,
) {
  if (!workerFilePath.trim()) throw new Error('worker file path is required');
  const result = await validatePh03CompanionSmokeFile(evidenceFilePath);
  const workerRaw = await readFile(workerFilePath, 'utf8');
  const worker = JSON.parse(workerRaw) as unknown;
  const workerHandoffSha256 = createHash('sha256')
    .update(canonicalJson(worker))
    .digest('hex');

  if (workerHandoffSha256 !== result.evidence.workerHandoffSha256) {
    throw new Error('worker handoff digest mismatch');
  }

  return result;
}

async function main(): Promise<void> {
  const evidenceFilePath =
    process.argv[2] ?? process.env.PH03_COMPANION_SMOKE_EVIDENCE;
  const workerFilePath =
    process.argv[3] ?? process.env.PH03_COMPANION_SMOKE_WORKER;
  if (!evidenceFilePath || !workerFilePath) {
    throw new Error(
      'usage: npm run validate:ph03-companion-smoke -- <live-evidence.json> <worker.json>',
    );
  }
  const result = await validatePh03CompanionSmokeBundle(
    evidenceFilePath,
    workerFilePath,
  );
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

const entryPoint = process.argv[1];
if (entryPoint && import.meta.url === pathToFileURL(entryPoint).href) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'invalid evidence';
    process.stderr.write(
      `PH03_COMPANION_SMOKE_INVALID: ${message.slice(0, 1000)}\n`,
    );
    process.exitCode = 1;
  });
}
