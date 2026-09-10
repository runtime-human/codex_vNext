import type { McpServer } from '@modelcontextprotocol/server';

import { ContextIndexService } from '../context/context-index-service.js';
import { ContextSourceResolver } from '../context/source-resolver.js';
import { ContextRepository } from '../state/context-repository.js';
import type {
  BeginWorkflowInput,
  RecordEvidenceInput,
  RequestDecisionInput,
  RunResourceJournal,
  StateService,
  TransitionWorkItemInput,
  UpdateWorkItemInput,
} from '../state/index.js';
import { registerContextTools } from './context-tools.js';
import { asToolResult } from './result.js';
import {
  DecisionRequestInputSchema,
  DecisionResolveInputSchema,
  EvidenceRecordInputSchema,
  MCP_OUTPUT_SCHEMAS,
  ResourceRecordInputSchema,
  WorkflowBeginInputSchema,
  WorkflowSummaryInputSchema,
  WorkGetInputSchema,
  WorkTransitionInputSchema,
  WorkUpdateInputSchema,
} from './schemas.js';

export interface RuntimeDependencies {
  service: StateService;
  resources: RunResourceJournal;
  context?: ContextIndexService;
}

const annotations = {
  read: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  create: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  mutate: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
} as const;

export const WORKFLOW_TOOL_ANNOTATIONS = {
  'workflow.summary': annotations.read,
  'workflow.begin': annotations.create,
  'work.get': annotations.read,
  'work.update': annotations.create,
  'work.transition': annotations.mutate,
  'decision.request': annotations.create,
  'decision.resolve': annotations.mutate,
  'evidence.record': annotations.create,
  'resource.record': annotations.mutate,
  'context.get': annotations.read,
  'context.query': annotations.read,
  'context.hydrate': annotations.read,
  'context.ingest_delta': annotations.mutate,
} as const;

function resolveContext(dependencies: RuntimeDependencies): ContextIndexService {
  if (dependencies.context) return dependencies.context;
  const repositories = dependencies.service.repositories;
  return new ContextIndexService({
    contexts: new ContextRepository(repositories.db),
    repositories,
    sourceResolver: new ContextSourceResolver({ repositories }),
  });
}

export function registerWorkflowTools(
  server: McpServer,
  dependencies: RuntimeDependencies,
): void {
  const { service, resources } = dependencies;
  const context = resolveContext(dependencies);

  server.registerTool(
    'workflow.summary',
    {
      description: 'Return the bounded persisted workflow projection.',
      inputSchema: WorkflowSummaryInputSchema,
      outputSchema: MCP_OUTPUT_SCHEMAS['workflow.summary'],
      annotations: WORKFLOW_TOOL_ANNOTATIONS['workflow.summary'],
    },
    (input) =>
      asToolResult(
        () =>
          service.getWorkflowSummary(
            input as { projectRoot?: string; runId?: string },
          ),
        (value) => `next safe action: ${value.nextSafeAction}`,
      ),
  );
  server.registerTool(
    'workflow.begin',
    {
      description: 'Start one idempotent persisted workflow run.',
      inputSchema: WorkflowBeginInputSchema,
      outputSchema: MCP_OUTPUT_SCHEMAS['workflow.begin'],
      annotations: WORKFLOW_TOOL_ANNOTATIONS['workflow.begin'],
    },
    (input) =>
      asToolResult(
        () => service.beginWorkflow(input as BeginWorkflowInput),
        (value) => `workflow ${value.runId} started`,
      ),
  );
  server.registerTool(
    'work.get',
    {
      description: 'Read one work item with bounded evidence and decisions.',
      inputSchema: WorkGetInputSchema,
      outputSchema: MCP_OUTPUT_SCHEMAS['work.get'],
      annotations: WORKFLOW_TOOL_ANNOTATIONS['work.get'],
    },
    (input) =>
      asToolResult(
        () => service.getWorkItem(input.workItemId),
        (value) => `work ${value.workItemId}: ${value.state}`,
      ),
  );
  server.registerTool(
    'work.update',
    {
      description: 'Create or patch a work item idempotently.',
      inputSchema: WorkUpdateInputSchema,
      outputSchema: MCP_OUTPUT_SCHEMAS['work.update'],
      annotations: WORKFLOW_TOOL_ANNOTATIONS['work.update'],
    },
    (input) =>
      asToolResult(
        () => service.updateWorkItem(input as UpdateWorkItemInput),
        (value) => `work ${value.workItemId} version ${value.version}`,
      ),
  );
  server.registerTool(
    'work.transition',
    {
      description: 'Apply a guarded work-state transition idempotently.',
      inputSchema: WorkTransitionInputSchema,
      outputSchema: MCP_OUTPUT_SCHEMAS['work.transition'],
      annotations: WORKFLOW_TOOL_ANNOTATIONS['work.transition'],
    },
    (input) =>
      asToolResult(
        () => service.transitionWorkItem(input as TransitionWorkItemInput),
        (value) => `work ${value.workItemId}: ${value.state}`,
      ),
  );
  server.registerTool(
    'decision.request',
    {
      description: 'Record a pending decision idempotently.',
      inputSchema: DecisionRequestInputSchema,
      outputSchema: MCP_OUTPUT_SCHEMAS['decision.request'],
      annotations: WORKFLOW_TOOL_ANNOTATIONS['decision.request'],
    },
    (input) =>
      asToolResult(
        () => service.requestDecision(input as RequestDecisionInput),
        (value) => `decision ${value.decisionId} pending`,
      ),
  );
  server.registerTool(
    'decision.resolve',
    {
      description: 'Resolve a pending decision idempotently.',
      inputSchema: DecisionResolveInputSchema,
      outputSchema: MCP_OUTPUT_SCHEMAS['decision.resolve'],
      annotations: WORKFLOW_TOOL_ANNOTATIONS['decision.resolve'],
    },
    (input) =>
      asToolResult(
        () => service.resolveDecision(input),
        (value) => `decision ${value.decisionId} resolved`,
      ),
  );
  server.registerTool(
    'evidence.record',
    {
      description: 'Record curated workflow evidence idempotently.',
      inputSchema: EvidenceRecordInputSchema,
      outputSchema: MCP_OUTPUT_SCHEMAS['evidence.record'],
      annotations: WORKFLOW_TOOL_ANNOTATIONS['evidence.record'],
    },
    (input) =>
      asToolResult(
        () => service.recordEvidence(input as RecordEvidenceInput),
        (value) => `evidence ${value.evidenceId}: ${value.status}`,
      ),
  );
  server.registerTool(
    'resource.record',
    {
      description: 'Record or transition a native resource lifecycle.',
      inputSchema: ResourceRecordInputSchema,
      outputSchema: MCP_OUTPUT_SCHEMAS['resource.record'],
      annotations: WORKFLOW_TOOL_ANNOTATIONS['resource.record'],
    },
    (input) =>
      asToolResult(
        () => {
          switch (input.operation) {
            case 'intent':
              return resources.recordIntent(
                input as Parameters<typeof resources.recordIntent>[0],
              );
            case 'observe':
              return resources.observe(
                input as Parameters<typeof resources.observe>[0],
              );
            case 'attach':
              return resources.attach(input);
            case 'transition':
              return resources.transition(
                input as Parameters<typeof resources.transition>[0],
              );
          }
        },
        (value) => `resource ${value.resourceId}: ${value.status}`,
      ),
  );

  registerContextTools(server, context, {
    read: annotations.read,
    mutate: annotations.mutate,
  });
}
