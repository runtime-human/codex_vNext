import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { validatePh03CompanionSmoke } from './ph03-companion-smoke.js';

export async function validatePh03CompanionSmokeFile(filePath: string) {
  if (!filePath.trim()) throw new Error('evidence file path is required');
  const raw = await readFile(filePath, 'utf8');
  return validatePh03CompanionSmoke(JSON.parse(raw) as unknown);
}

async function main(): Promise<void> {
  const filePath = process.argv[2] ?? process.env.PH03_COMPANION_SMOKE_EVIDENCE;
  if (!filePath) {
    throw new Error(
      'usage: npm run validate:ph03-companion-smoke -- <live-evidence.json>',
    );
  }
  const result = await validatePh03CompanionSmokeFile(filePath);
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
