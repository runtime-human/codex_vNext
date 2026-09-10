import type { McpServer } from '@modelcontextprotocol/server';

import type {
  ContextGetInput,
  ContextHydrateInput,
  ContextIndexService,
  ContextIngestDeltaInput,
} from '../context/context-index-service.js';
import { StateError } from '../state/index.js';
import { asToolResult } from './result.js';
import {
  ContextGetInputSchema,
  ContextHydrateInputSchema,
  ContextIngestDeltaInputSchema,
  ContextQueryInputSchema,
} from './context-schemas.js';
import { MCP_OUTPUT_SCHEMAS } from './schemas.js';

export interface ContextToolAnnotations {
  read: {
    readonly readOnlyHint: true;
    readonly destructiveHint: false;
    readonly idempotentHint: true;
    readonly openWorldHint: false;
  };
  mutate: {
    readonly readOnlyHint: false;
    readonly destructiveHint: true;
    readonly idempotentHint: true;
    readonly openWorldHint: false;
  };
}

export function registerContextTools(
  server: McpServer,
  context: ContextIndexService,
  annotations: ContextToolAnnotations,
): void {
  server.registerTool(
    'context.get',
    {
      description: 'Read one project-scoped context item after freshness validation.',
      inputSchema: ContextGetInputSchema,
      outputSchema: MCP_OUTPUT_SCHEMAS['context.get'],
      annotations: annotations.read,
    },
    (input) =>
      asToolResult(
        async () => {
          const hit = await context.get(input as ContextGetInput);
          if (!hit) throw new StateError('NOT_FOUND', 'context item not found');
          return hit;
        },
        (value) => `context ${value.item.contextId}: ${value.freshness}`,
      ),
  );

  server.registerTool(
    'context.query',
    {
      description: 'Query bounded project-scoped context with deterministic ranking.',
      inputSchema: ContextQueryInputSchema,
      outputSchema: MCP_OUTPUT_SCHEMAS['context.query'],
      annotations: annotations.read,
    },
    (input) =>
      asToolResult(
        () => context.query(input),
        (value) => `context query returned ${value.hits.length} hits`,
      ),
  );

  server.registerTool(
    'context.hydrate',
    {
      description: 'Build a bounded fresh-only Companion hydration capsule.',
      inputSchema: ContextHydrateInputSchema,
      outputSchema: MCP_OUTPUT_SCHEMAS['context.hydrate'],
      annotations: annotations.read,
    },
    (input) =>
      asToolResult(
        () => context.hydrate(input as ContextHydrateInput),
        (value) => `hydrated ${value.contextItems.length} context items`,
      ),
  );

  server.registerTool(
    'context.ingest_delta',
    {
      description: 'Atomically ingest one validated idempotent ContextDelta.',
      inputSchema: ContextIngestDeltaInputSchema,
      outputSchema: MCP_OUTPUT_SCHEMAS['context.ingest_delta'],
      annotations: annotations.mutate,
    },
    (input) =>
      asToolResult(
        () => context.ingestDelta(input as ContextIngestDeltaInput),
        (value) => `ingested ${value.acceptedItems} context delta items`,
      ),
  );
}
