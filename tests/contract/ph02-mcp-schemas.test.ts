import { describe, expect, it } from 'vitest';

import {
  MCP_INPUT_SCHEMAS,
  ResourceRecordInputSchema,
  WorkflowSummaryInputSchema,
  WorkTransitionInputSchema,
} from '../../src/mcp/schemas.js';

describe('PH-02 MCP input schemas', () => {
  it('rejects unknown fields and requires one summary locator', () => {
    expect(WorkflowSummaryInputSchema.safeParse({}).success).toBe(false);
    expect(
      WorkflowSummaryInputSchema.safeParse({ runId: 'run-1', extra: true })
        .success,
    ).toBe(false);
  });

  it('requires bounded command ids and positive versions on mutations', () => {
    expect(
      MCP_INPUT_SCHEMAS['workflow.begin'].safeParse({
        projectRoot: '.',
        objective: 'test',
      }).success,
    ).toBe(false);
    expect(
      MCP_INPUT_SCHEMAS['decision.resolve'].safeParse({
        commandId: 'x'.repeat(161),
        decisionId: 'decision-1',
        expectedVersion: 0,
        resolution: 'yes',
      }).success,
    ).toBe(false);
  });

  it('requires completion only for done transitions', () => {
    expect(
      WorkTransitionInputSchema.safeParse({
        commandId: 'done',
        workItemId: 'work-1',
        expectedVersion: 1,
        to: 'done',
      }).success,
    ).toBe(false);
    expect(
      WorkTransitionInputSchema.safeParse({
        commandId: 'run',
        workItemId: 'work-1',
        expectedVersion: 1,
        to: 'running',
        completion: { achievedLevel: 'implemented', evidenceIds: ['ev-1'] },
      }).success,
    ).toBe(false);
  });

  it('validates every resource operation as a strict union', () => {
    expect(
      ResourceRecordInputSchema.safeParse({
        operation: 'observe',
        commandId: 'observe',
        runId: 'run-1',
        type: 'worktree',
        owner: 'main',
      }).success,
    ).toBe(false);
    expect(
      ResourceRecordInputSchema.safeParse({
        operation: 'attach',
        commandId: 'attach',
        resourceId: 'resource-1',
        expectedVersion: 1,
        nativeRef: 'thread-1',
      }).success,
    ).toBe(true);
  });
});
