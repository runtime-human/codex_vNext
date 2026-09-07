import type { McpServer } from '@modelcontextprotocol/server';

import type {
  BeginWorkflowInput,
  RecordEvidenceInput,
  RequestDecisionInput,
  RunResourceJournal,
  StateService,
  TransitionWorkItemInput,
  UpdateWorkItemInput,
} from '../state/index.js';
import { asToolResult } from './result.js';
import {
  DecisionRequestInputSchema,
  DecisionResolveInputSchema,
  EvidenceRecordInputSchema,
  ResourceRecordInputSchema,
  ToolOutputSchema,
  WorkflowBeginInputSchema,
  WorkflowSummaryInputSchema,
  WorkGetInputSchema,
  WorkTransitionInputSchema,
  WorkUpdateInputSchema,
} from './schemas.js';

export interface RuntimeDependencies {
  service: StateService;
  resources: RunResourceJournal;
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
} as const;

export function registerWorkflowTools(
  server: McpServer,
  dependencies: RuntimeDependencies,
): void {
  const { service, resources } = dependencies;

  server.registerTool(
    'workflow.summary',
    {
      description: 'Return the bounded persisted workflow projection.',
      inputSchema: WorkflowSummaryInputSchema,
      outputSchema: ToolOutputSchema,
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
      outputSchema: ToolOutputSchema,
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
      outputSchema: ToolOutputSchema,
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
      outputSchema: ToolOutputSchema,
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
      outputSchema: ToolOutputSchema,
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
      outputSchema: ToolOutputSchema,
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
      outputSchema: ToolOutputSchema,
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
      outputSchema: ToolOutputSchema,
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
      outputSchema: ToolOutputSchema,
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
}
