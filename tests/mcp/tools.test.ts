import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { afterEach, describe, expect, it } from 'vitest';

import { buildWorkflowNextMcpServer } from '../../src/mcp/server.js';
import { WORKFLOW_TOOL_ANNOTATIONS } from '../../src/mcp/tools.js';
import {
  migrateDatabase,
  openWorkflowDatabase,
  RunResourceJournal,
  resolveStorageRoot,
  StateRepositories,
  StateService,
} from '../../src/state/index.js';

const roots: string[] = [];
const clients: Client[] = [];
const servers: ReturnType<typeof buildWorkflowNextMcpServer>[] = [];
const databases: DatabaseSync[] = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  await Promise.all(servers.splice(0).map((server) => server.close()));
  for (const db of databases.splice(0)) if (db.isOpen) db.close();
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true })),
  );
});

async function harness() {
  const projectRoot = await mkdtemp(
    path.join(tmpdir(), 'workflow-mcp-project-'),
  );
  const pluginData = await mkdtemp(path.join(tmpdir(), 'workflow-mcp-data-'));
  roots.push(projectRoot, pluginData);
  const storage = resolveStorageRoot(pluginData);
  const db = openWorkflowDatabase(storage);
  databases.push(db);
  await migrateDatabase(db, storage);
  const repositories = new StateRepositories(db);
  const server = buildWorkflowNextMcpServer({
    service: new StateService({ db, repositories }),
    resources: new RunResourceJournal({ db, repositories }),
  });
  const client = new Client({ name: 'workflow-next-test', version: '1.0.0' });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  servers.push(server);
  clients.push(client);
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, db, projectRoot };
}

type ToolValue = Record<string, unknown> & {
  runId: string;
  workItemId: string;
  evidenceId: string;
  state: string;
  version: number;
  activeWork: unknown[];
};

function value(result: Awaited<ReturnType<Client['callTool']>>): ToolValue {
  return (result.structuredContent as { ok: true; value: ToolValue }).value;
}

describe('PH-02 MCP tools', () => {
  it('publishes exactly nine tools with truthful annotations', async () => {
    const { client } = await harness();
    const listed = await client.listTools();
    expect(listed.tools.map((tool) => tool.name).sort()).toEqual(
      Object.keys(WORKFLOW_TOOL_ANNOTATIONS).sort(),
    );
    for (const tool of listed.tools) {
      expect(tool.annotations).toEqual(
        WORKFLOW_TOOL_ANNOTATIONS[
          tool.name as keyof typeof WORKFLOW_TOOL_ANNOTATIONS
        ],
      );
      expect(tool.inputSchema).toBeDefined();
      expect(tool.outputSchema).toBeDefined();
    }
  });

  it('executes the complete evidence-bound workflow and preserves idempotency', async () => {
    const { client, db, projectRoot } = await harness();
    const beginArgs = {
      commandId: 'begin-1',
      projectRoot,
      objective: 'prove MCP',
      durable: false,
    };
    const first = await client.callTool({
      name: 'workflow.begin',
      arguments: beginArgs,
    });
    const duplicate = await client.callTool({
      name: 'workflow.begin',
      arguments: beginArgs,
    });
    expect(duplicate.structuredContent).toEqual(first.structuredContent);
    const run = value(first);
    expect(
      db.prepare('SELECT count(*) AS count FROM workflow_events').get(),
    ).toEqual({ count: 1 });

    const work = value(
      await client.callTool({
        name: 'work.update',
        arguments: {
          operation: 'create',
          commandId: 'work-1',
          runId: run.runId,
          title: 'MCP work',
          objective: 'complete safely',
          risk: 'low',
          acceptance: {
            requiredLevel: 'validated_local',
            criteria: ['focused test passes'],
            requiredEvidenceKinds: ['test'],
          },
        },
      }),
    );
    const evidence = value(
      await client.callTool({
        name: 'evidence.record',
        arguments: {
          commandId: 'evidence-1',
          runId: run.runId,
          workItemId: work.workItemId,
          kind: 'test',
          summary: 'focused test passed',
          status: 'pass',
        },
      }),
    );
    const running = value(
      await client.callTool({
        name: 'work.transition',
        arguments: {
          commandId: 'running-1',
          workItemId: work.workItemId,
          expectedVersion: 1,
          to: 'running',
        },
      }),
    );
    const verifying = value(
      await client.callTool({
        name: 'work.transition',
        arguments: {
          commandId: 'verifying-1',
          workItemId: work.workItemId,
          expectedVersion: running.version,
          to: 'verifying',
        },
      }),
    );
    const done = value(
      await client.callTool({
        name: 'work.transition',
        arguments: {
          commandId: 'done-1',
          workItemId: work.workItemId,
          expectedVersion: verifying.version,
          to: 'done',
          completion: {
            achievedLevel: 'validated_local',
            evidenceIds: [evidence.evidenceId],
          },
        },
      }),
    );
    expect(done.state).toBe('done');

    const summary = value(
      await client.callTool({
        name: 'workflow.summary',
        arguments: { runId: run.runId },
      }),
    );
    expect(summary.activeWork).toEqual([]);
  });

  it.each([
    ['VERSION_CONFLICT', 'stale version'],
    ['COMPLETION_BLOCKED', 'missing completion evidence'],
    ['IDEMPOTENCY_CONFLICT', 'changed duplicate payload'],
  ])('returns bounded %s errors without stacks', async (expectedCode) => {
    const { client, projectRoot } = await harness();
    const run = value(
      await client.callTool({
        name: 'workflow.begin',
        arguments: {
          commandId: 'begin-errors',
          projectRoot,
          objective: 'errors',
          durable: false,
        },
      }),
    );
    const work = value(
      await client.callTool({
        name: 'work.update',
        arguments: {
          operation: 'create',
          commandId: 'work-errors',
          runId: run.runId,
          title: 'error work',
          objective: 'exercise errors',
          risk: 'low',
          acceptance: {
            requiredLevel: 'implemented',
            criteria: ['exists'],
            requiredEvidenceKinds: [],
          },
        },
      }),
    );
    let result: Awaited<ReturnType<Client['callTool']>> | undefined;
    if (expectedCode === 'VERSION_CONFLICT') {
      result = await client.callTool({
        name: 'work.transition',
        arguments: {
          commandId: 'stale',
          workItemId: work.workItemId,
          expectedVersion: 2,
          to: 'running',
        },
      });
    } else if (expectedCode === 'COMPLETION_BLOCKED') {
      const running = value(
        await client.callTool({
          name: 'work.transition',
          arguments: {
            commandId: 'run-before-block',
            workItemId: work.workItemId,
            expectedVersion: 1,
            to: 'running',
          },
        }),
      );
      const verifying = value(
        await client.callTool({
          name: 'work.transition',
          arguments: {
            commandId: 'verify-before-block',
            workItemId: work.workItemId,
            expectedVersion: running.version,
            to: 'verifying',
          },
        }),
      );
      result = await client.callTool({
        name: 'work.transition',
        arguments: {
          commandId: 'done-blocked',
          workItemId: work.workItemId,
          expectedVersion: verifying.version,
          to: 'done',
          completion: {
            achievedLevel: 'implemented',
            evidenceIds: ['missing'],
          },
        },
      });
    } else {
      await client.callTool({
        name: 'workflow.begin',
        arguments: {
          commandId: 'conflict',
          projectRoot,
          objective: 'first',
          durable: false,
        },
      });
      result = await client.callTool({
        name: 'workflow.begin',
        arguments: {
          commandId: 'conflict',
          projectRoot,
          objective: 'changed',
          durable: false,
        },
      });
    }
    expect(result).toBeDefined();
    if (!result) throw new Error('expected tool result');
    expect(result.isError).toBe(true);
    expect(
      (result.structuredContent as { error: { code: string } }).error.code,
    ).toBe(expectedCode);
    expect(JSON.stringify(result)).not.toContain('stack');
    expect(JSON.stringify(result).length).toBeLessThan(2_000);
  });
});
