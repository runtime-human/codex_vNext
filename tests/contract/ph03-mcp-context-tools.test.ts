import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import type { McpServer } from '@modelcontextprotocol/server';
import { afterEach, describe, expect, it } from 'vitest';
import type { z } from 'zod';

const clients: Client[] = [];
const servers: McpServer[] = [];

const readAnnotation = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};
const mutateAnnotation = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: false,
};

async function modules() {
  const tools = (await import('../../src/mcp/tools.js')) as unknown as {
    WORKFLOW_TOOL_ANNOTATIONS: Record<string, unknown>;
  };
  const schemas = (await import('../../src/mcp/schemas.js')) as unknown as {
    MCP_INPUT_SCHEMAS: Record<string, z.ZodType>;
    MCP_OUTPUT_SCHEMAS: Record<string, z.ZodType>;
  };
  const server = (await import('../../src/mcp/server.js')) as unknown as {
    buildWorkflowNextMcpServer(dependencies: unknown): McpServer;
  };
  return { tools, schemas, server };
}

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

describe('PH-03 MCP context tools', () => {
  it('publishes exactly the four bounded PH-03 tools with truthful annotations', async () => {
    const { tools, server: serverModule } = await modules();
    const contextNames = [
      'context.get',
      'context.hydrate',
      'context.ingest_delta',
      'context.query',
    ];
    expect(
      Object.keys(tools.WORKFLOW_TOOL_ANNOTATIONS)
        .filter((name) => name.startsWith('context.'))
        .sort(),
    ).toEqual(contextNames);
    expect(tools.WORKFLOW_TOOL_ANNOTATIONS['context.get']).toEqual(
      readAnnotation,
    );
    expect(tools.WORKFLOW_TOOL_ANNOTATIONS['context.query']).toEqual(
      readAnnotation,
    );
    expect(tools.WORKFLOW_TOOL_ANNOTATIONS['context.hydrate']).toEqual(
      readAnnotation,
    );
    expect(tools.WORKFLOW_TOOL_ANNOTATIONS['context.ingest_delta']).toEqual(
      mutateAnnotation,
    );
    expect(
      Object.keys(tools.WORKFLOW_TOOL_ANNOTATIONS).some((name) =>
        /route|model|thread|dispatch|agent/.test(name),
      ),
    ).toBe(false);

    const server = serverModule.buildWorkflowNextMcpServer({
      service: {},
      resources: {},
      context: {
        async get() {
          return undefined;
        },
        async query(input: { projectId: string }) {
          return { projectId: input.projectId, hits: [], truncated: false };
        },
        async hydrate(input: {
          taskId: string;
          projectId: string;
          runId: string;
        }) {
          return {
            capsuleVersion: 1,
            taskId: input.taskId,
            projectId: input.projectId,
            runId: input.runId,
            objective: 'test',
            contextItems: [],
            relevantDecisionIds: [],
            evidenceIds: [],
            unresolvedQuestions: [],
          };
        },
        async ingestDelta(input: {
          projectId: string;
          runId: string;
          expectedTaskId: string;
        }) {
          return {
            projectId: input.projectId,
            runId: input.runId,
            taskId: input.expectedTaskId,
            insertedContextIds: [],
            staleContextIds: [],
            acceptedItems: 0,
            unresolvedQuestions: [],
          };
        },
      },
    });
    servers.push(server);
    const client = new Client({ name: 'ph03-mcp-test', version: '1.0.0' });
    clients.push(client);
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const listed = await client.listTools();
    expect(listed.tools).toHaveLength(13);
    expect(
      listed.tools
        .map((tool) => tool.name)
        .filter((name) => name.startsWith('context.'))
        .sort(),
    ).toEqual(contextNames);
    const query = await client.callTool({
      name: 'context.query',
      arguments: { projectId: 'project-a' },
    });
    expect(query.isError).not.toBe(true);
    expect(query.structuredContent).toEqual({
      ok: true,
      value: { projectId: 'project-a', hits: [], truncated: false },
    });
  });

  it('uses strict bounded input schemas and declares structured outputs', async () => {
    const { schemas } = await modules();
    for (const name of [
      'context.get',
      'context.query',
      'context.hydrate',
      'context.ingest_delta',
    ]) {
      expect(schemas.MCP_INPUT_SCHEMAS[name]).toBeDefined();
      expect(schemas.MCP_OUTPUT_SCHEMAS[name]).toBeDefined();
    }

    expect(
      schemas.MCP_INPUT_SCHEMAS['context.get']?.safeParse({
        projectId: 'project-a',
        contextId: 'context-a',
        extra: true,
      }).success,
    ).toBe(false);
    expect(
      schemas.MCP_INPUT_SCHEMAS['context.query']?.safeParse({
        projectId: 'project-a',
        terms: Array.from({ length: 9 }, (_, index) => `term-${index}`),
      }).success,
    ).toBe(false);
    expect(
      schemas.MCP_INPUT_SCHEMAS['context.hydrate']?.safeParse({
        taskId: 'task-a',
        projectId: 'project-a',
        runId: 'run-a',
        scopes: Array.from({ length: 9 }, (_, index) => `scope-${index}`),
      }).success,
    ).toBe(false);

    const item = {
      kind: 'new',
      contextKind: 'source_pointer',
      scope: 'src',
      summary: 'summary',
      sourceUri: 'repo:src/a.ts',
      sourceHash: 'a'.repeat(64),
    };
    expect(
      schemas.MCP_INPUT_SCHEMAS['context.ingest_delta']?.safeParse({
        commandId: 'command-a',
        projectId: 'project-a',
        runId: 'run-a',
        expectedTaskId: 'task-a',
        delta: {
          deltaVersion: 1,
          taskId: 'task-a',
          items: Array.from({ length: 17 }, () => item),
          unresolvedQuestions: [],
        },
      }).success,
    ).toBe(false);
  });
});
