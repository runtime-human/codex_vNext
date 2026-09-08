import { spawn } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

type ProbeResult = {
  isError?: boolean;
  structuredContent: Record<string, unknown>;
};

const probeScript = path.join(
  process.cwd(),
  'tests/probes/tp02a-mcp-storage-probe.mjs',
);
const fixtures: string[] = [];

async function callProbe(pluginData: string, mode: string, nonce: string) {
  return new Promise<ProbeResult>((resolve, reject) => {
    const child = spawn(process.execPath, [probeScript], {
      cwd: process.cwd(),
      env: { ...process.env, PLUGIN_DATA: pluginData } as Record<
        string,
        string
      >,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `probe exited with ${code}`));
        return;
      }
      try {
        const response = JSON.parse(stdout.trim()) as {
          result?: ProbeResult;
        };
        if (!response.result) throw new Error('probe returned no result');
        resolve(response.result);
      } catch (error) {
        reject(error);
      }
    });
    child.stdin.end(
      `${JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'tp02a.storage_probe',
          arguments: { mode, nonce },
        },
      })}\n`,
    );
  });
}

afterEach(async () => {
  await Promise.all(
    fixtures
      .splice(0)
      .map((fixture) => rm(fixture, { recursive: true, force: true })),
  );
});

it('verifies across a fresh process and cleans only the nonce-owned files', async () => {
  const pluginData = await mkdtemp(path.join(tmpdir(), 'tp02a-probe-test-'));
  fixtures.push(pluginData);
  const nonce = 'probe_nonce_test';
  const probeRoot = path.join(pluginData, 'tp02a');

  await expect(callProbe(pluginData, 'write', nonce)).resolves.toMatchObject({
    structuredContent: {
      sqliteTransaction: 'pass',
      sqliteReopen: 'pass',
    },
  });
  await writeFile(path.join(probeRoot, 'unrelated.txt'), 'keep');
  await expect(callProbe(pluginData, 'verify', nonce)).resolves.toMatchObject({
    structuredContent: { restartPersistence: 'pass' },
  });
  await expect(callProbe(pluginData, 'cleanup', nonce)).resolves.toMatchObject({
    structuredContent: { cleanup: 'pass' },
  });

  await expect(
    readFile(path.join(probeRoot, 'unrelated.txt'), 'utf8'),
  ).resolves.toBe('keep');
  await expect(readdir(probeRoot)).resolves.toEqual(['unrelated.txt']);
});

it('rejects a cleanup nonce outside the probe filename contract', async () => {
  const pluginData = await mkdtemp(path.join(tmpdir(), 'tp02a-probe-test-'));
  fixtures.push(pluginData);

  await expect(
    callProbe(pluginData, 'cleanup', '../escape'),
  ).resolves.toMatchObject({
    isError: true,
    structuredContent: { error: 'invalid nonce' },
  });
});
