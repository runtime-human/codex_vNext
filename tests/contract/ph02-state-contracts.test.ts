import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

function supportsPh02Node(version: string): boolean {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) return false;

  const major = Number(match[1]);
  const minor = Number(match[2]);
  return major === 24 && minor >= 12;
}

describe('PH-02 runtime contracts', () => {
  it('rejects Node versions outside the supported 24.12 floor', () => {
    expect(supportsPh02Node('24.11.9')).toBe(false);
    expect(supportsPh02Node('24.12.0')).toBe(true);
    expect(supportsPh02Node('24.99.0')).toBe(true);
    expect(supportsPh02Node('25.0.0')).toBe(false);
    expect(supportsPh02Node('invalid')).toBe(false);
  });

  it('declares and runs on the PH-02 Node floor', async () => {
    const packageJson = JSON.parse(
      await readFile(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as { engines?: { node?: string } };

    expect(packageJson.engines?.node).toBe('>=24.12 <25');
    expect(supportsPh02Node(process.versions.node)).toBe(true);
    await expect(import('node:sqlite')).resolves.toBeDefined();
  });
});
