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

function sha256Text(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function requireRecord(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${name} must be a JSON object`);
  }
  return value as Record<string, unknown>;
}

function requireString(
  record: Record<string, unknown>,
  key: string,
  name: string,
): string {
  const value = record[key];
  if (typeof value !== 'string' || !value) {
    throw new Error(`${name}.${key} must be a non-empty string`);
  }
  return value;
}

export async function validatePh03CompanionSmokeBundle(
  evidenceFilePath: string,
  workerFilePath: string,
  parentFilePath: string,
) {
  if (!workerFilePath.trim()) throw new Error('worker file path is required');
  if (!parentFilePath.trim()) throw new Error('parent file path is required');
  const result = await validatePh03CompanionSmokeFile(evidenceFilePath);

  const workerRaw = await readFile(workerFilePath, 'utf8');
  const worker = JSON.parse(workerRaw) as unknown;
  const workerHandoffSha256 = createHash('sha256')
    .update(canonicalJson(worker))
    .digest('hex');
  if (workerHandoffSha256 !== result.evidence.workerHandoffSha256) {
    throw new Error('worker handoff digest mismatch');
  }

  const parentRaw = await readFile(parentFilePath, 'utf8');
  const parent = requireRecord(JSON.parse(parentRaw) as unknown, 'parent');
  if (
    parent.packetVersion !== 2 ||
    parent.phase !== 'PH-03' ||
    parent.probe !== 'companion_live_smoke'
  ) {
    throw new Error('parent artifact contract mismatch');
  }

  const parentOnlyMarker = requireString(parent, 'parentOnlyMarker', 'parent');
  const parentMarkerSha256 = sha256Text(parentOnlyMarker);
  if (parentMarkerSha256 !== result.evidence.parentMarkerSha256) {
    throw new Error('parent marker digest mismatch');
  }
  if (
    requireString(parent, 'parentMarkerSha256', 'parent') !==
    result.evidence.parentMarkerSha256
  ) {
    throw new Error('parent artifact marker digest mismatch');
  }
  if (
    requireString(parent, 'workerHandoffSha256', 'parent') !==
    result.evidence.workerHandoffSha256
  ) {
    throw new Error('parent worker handoff digest mismatch');
  }
  if (
    requireString(parent, 'runtimeCommit', 'parent') !==
      result.evidence.runtimeCommit ||
    requireString(parent, 'codexVersion', 'parent') !==
      result.evidence.codexVersion ||
    requireString(parent, 'hostSurface', 'parent') !==
      result.evidence.hostSurface
  ) {
    throw new Error('parent runtime metadata mismatch');
  }

  const launch = requireRecord(parent.launch, 'parent.launch');
  if (
    launch.requestedRole !== result.evidence.worker.requestedRole ||
    launch.forkTurns !== result.evidence.worker.forkTurns ||
    launch.requestedAuthority !== result.evidence.worker.requestedAuthority ||
    launch.singleChildOnly !== true ||
    result.evidence.worker.singleChildObserved !== true
  ) {
    throw new Error('parent launch contract mismatch');
  }

  return result;
}

async function main(): Promise<void> {
  const evidenceFilePath =
    process.argv[2] ?? process.env.PH03_COMPANION_SMOKE_EVIDENCE;
  const workerFilePath =
    process.argv[3] ?? process.env.PH03_COMPANION_SMOKE_WORKER;
  const parentFilePath =
    process.argv[4] ?? process.env.PH03_COMPANION_SMOKE_PARENT;
  if (!evidenceFilePath || !workerFilePath || !parentFilePath) {
    throw new Error(
      'usage: npm run validate:ph03-companion-smoke -- <live-evidence.json> <worker.json> <parent.json>',
    );
  }
  const result = await validatePh03CompanionSmokeBundle(
    evidenceFilePath,
    workerFilePath,
    parentFilePath,
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
