import { describe, expect, it } from 'vitest';

import {
  DecisionRequestInputSchema,
  EvidenceRecordInputSchema,
  MCP_INPUT_SCHEMAS,
  MCP_OUTPUT_SCHEMAS,
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

  it('uses strict per-tool output contracts', () => {
    const summary = {
      ok: true,
      value: {
        activeWork: [],
        pendingDecisions: [],
        evidenceRefs: [],
        cleanupRequiredResources: [],
        nextSafeAction: 'start_run',
      },
    };
    expect(
      MCP_OUTPUT_SCHEMAS['workflow.summary'].safeParse(summary).success,
    ).toBe(true);
    expect(
      MCP_OUTPUT_SCHEMAS['workflow.summary'].safeParse({
        ok: true,
        value: { arbitrary: true },
      }).success,
    ).toBe(false);
    expect(
      MCP_OUTPUT_SCHEMAS['workflow.begin'].safeParse(summary).success,
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
    expect(
      WorkTransitionInputSchema.safeParse({
        commandId: 'run',
        workItemId: 'work-1',
        expectedVersion: 1,
        to: 'running',
        note: 'not part of the durable transition contract',
      }).success,
    ).toBe(false);
  });

  it('rejects oversized text, evidence and collections at the MCP boundary', () => {
    expect(
      MCP_INPUT_SCHEMAS['workflow.begin'].safeParse({
        commandId: 'begin',
        projectRoot: '.',
        objective: 'x'.repeat(100_000),
      }).success,
    ).toBe(false);
    expect(
      EvidenceRecordInputSchema.safeParse({
        commandId: 'evidence',
        runId: 'run-1',
        kind: 'test',
        summary: 'x'.repeat(100_000),
        status: 'pass',
      }).success,
    ).toBe(false);
    expect(
      DecisionRequestInputSchema.safeParse({
        commandId: 'decision',
        runId: 'run-1',
        question: 'Which bounded option should be used?',
        alternatives: Array.from({ length: 100 }, (_, index) => ({
          id: `option-${index}`,
          label: `Option ${index}`,
        })),
        authority: 'main',
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
