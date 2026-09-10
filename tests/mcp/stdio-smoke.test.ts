import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { afterAll, beforeAll, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
let pluginData: string | undefined;

beforeAll(async () => {
  await execFileAsync(
    process.execPath,
    ['./node_modules/typescript/bin/tsc', '-p', 'tsconfig.build.json'],
    { cwd: process.cwd() },
  );
  pluginData = await mkdtemp(path.join(tmpdir(), 'workflow-stdio-'));
});

afterAll(async () => {
  if (pluginData) await rm(pluginData, { recursive: true });
});

it('serves the production entry point over stdio with PLUGIN_DATA', async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['./dist/mcp/index.js'],
    cwd: process.cwd(),
    env: { ...process.env, PLUGIN_DATA: pluginData as string } as Record<
      string,
      string
    >,
    stderr: 'pipe',
  });
  const client = new Client({ name: 'stdio-smoke', version: '1.0.0' });
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    const names = tools.tools.map((tool) => tool.name);
    expect(tools.tools).toHaveLength(13);
    expect(names).toContain('workflow.summary');
    expect(names).toEqual(
      expect.arrayContaining([
        'context.get',
        'context.query',
        'context.hydrate',
        'context.ingest_delta',
      ]),
    );
  } finally {
    await client.close();
  }
});
