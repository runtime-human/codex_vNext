import type { DatabaseSync } from 'node:sqlite';

import { type Clock, systemClock } from './clock.js';
import { StateError } from './errors.js';
import { executeIdempotent } from './idempotency.js';
import { newEventId, newResourceId } from './ids.js';
import { redactSensitiveText } from './redaction.js';
import {
  type ResourceRecord,
  StateRepositories,
  type WorkflowEventRecord,
} from './repositories.js';

type ResourceType = ResourceRecord['type'];

interface JournalDependencies {
  db: DatabaseSync;
  repositories?: StateRepositories;
  clock?: Clock;
}

interface ResourceIntentInput {
  commandId: string;
  runId: string;
  workItemId?: string;
  type: ResourceType;
  owner: string;
  cleanupRequired: boolean;
}

interface ResourceObserveInput {
  commandId: string;
  runId: string;
  workItemId?: string;
  type: ResourceType;
  owner: string;
  nativeRef: string;
}

interface ResourceAttachInput {
  commandId: string;
  resourceId: string;
  expectedVersion: number;
  nativeRef: string;
}

interface ResourceTransitionInput {
  commandId: string;
  resourceId: string;
  expectedVersion: number;
  to: 'running' | 'completed' | 'failed' | 'cleaned';
  error?: string;
  evidenceId?: string;
}

function withoutCommandId<T extends { commandId: string }>(
  input: T,
): Omit<T, 'commandId'> {
  const { commandId: _commandId, ...rest } = input;
  return rest;
}

export class RunResourceJournal {
  private readonly repositories: StateRepositories;
  private readonly clock: Clock;

  constructor(private readonly dependencies: JournalDependencies) {
    this.repositories =
      dependencies.repositories ?? new StateRepositories(dependencies.db);
    this.clock = dependencies.clock ?? systemClock;
  }

  private appendEvent(
    resource: ResourceRecord,
    eventType: string,
    commandId: string,
  ): WorkflowEventRecord {
    return this.repositories.appendEvent({
      eventId: newEventId(),
      runId: resource.runId,
      entityType: 'resource',
      entityId: resource.resourceId,
      eventType,
      payload: { status: resource.status, version: resource.version },
      commandId,
      createdAt: this.clock.nowIso(),
    });
  }

  private assertScope(runId: string, workItemId?: string): void {
    if (!this.repositories.getRun(runId))
      throw new StateError('NOT_FOUND', 'run not found');
    if (workItemId) {
      const item = this.repositories.getWorkItem(workItemId);
      if (!item || item.runId !== runId)
        throw new StateError('NOT_FOUND', 'work item not found in run');
    }
  }

  recordIntent(input: ResourceIntentInput): ResourceRecord {
    const resourceId = newResourceId();
    return executeIdempotent({
      db: this.dependencies.db,
      toolName: 'resource.record',
      commandId: input.commandId,
      runId: input.runId,
      normalizedInput: { operation: 'intent', ...withoutCommandId(input) },
      clock: this.clock,
      mutate: () => {
        this.assertScope(input.runId, input.workItemId);
        const now = this.clock.nowIso();
        const resource: ResourceRecord = {
          resourceId,
          runId: input.runId,
          ...(input.workItemId ? { workItemId: input.workItemId } : {}),
          type: input.type,
          control: 'coordinated',
          owner: input.owner,
          status: 'intent_recorded',
          cleanupRequired: input.cleanupRequired,
          version: 1,
          createdAt: now,
          updatedAt: now,
        };
        this.repositories.putResource(resource);
        this.appendEvent(resource, 'resource.intent_recorded', input.commandId);
        return resource;
      },
    });
  }

  observe(input: ResourceObserveInput): ResourceRecord {
    if ('cleanupRequired' in input) {
      throw new StateError(
        'INVALID_ARGUMENT',
        'observed resources cannot claim cleanup ownership',
      );
    }
    const resourceId = newResourceId();
    return executeIdempotent({
      db: this.dependencies.db,
      toolName: 'resource.record',
      commandId: input.commandId,
      runId: input.runId,
      normalizedInput: { operation: 'observe', ...withoutCommandId(input) },
      clock: this.clock,
      mutate: () => {
        this.assertScope(input.runId, input.workItemId);
        const now = this.clock.nowIso();
        const resource: ResourceRecord = {
          resourceId,
          runId: input.runId,
          ...(input.workItemId ? { workItemId: input.workItemId } : {}),
          type: input.type,
          control: 'observed',
          owner: input.owner,
          nativeRef: input.nativeRef,
          status: 'observed',
          cleanupRequired: false,
          version: 1,
          createdAt: now,
          updatedAt: now,
        };
        this.repositories.putResource(resource);
        this.appendEvent(resource, 'resource.observed', input.commandId);
        return resource;
      },
    });
  }

  attach(input: ResourceAttachInput): ResourceRecord {
    const current = this.repositories.getResource(input.resourceId);
    return executeIdempotent({
      db: this.dependencies.db,
      toolName: 'resource.record',
      commandId: input.commandId,
      ...(current ? { runId: current.runId } : {}),
      normalizedInput: { operation: 'attach', ...withoutCommandId(input) },
      clock: this.clock,
      mutate: () => {
        const resource = this.repositories.getResource(input.resourceId);
        if (!resource) throw new StateError('NOT_FOUND', 'resource not found');
        if (resource.version !== input.expectedVersion)
          throw new StateError(
            'VERSION_CONFLICT',
            'resource version does not match',
          );
        if (
          resource.control !== 'coordinated' ||
          resource.status !== 'intent_recorded'
        ) {
          throw new StateError(
            'INVALID_TRANSITION',
            'resource cannot be attached',
          );
        }
        const updated = this.repositories.updateResource(
          resource.resourceId,
          input.expectedVersion,
          {
            nativeRef: input.nativeRef,
            status: 'attached',
            cleanupRequired: resource.cleanupRequired,
          },
          this.clock.nowIso(),
        );
        this.appendEvent(updated, 'resource.attached', input.commandId);
        return updated;
      },
    });
  }

  transition(input: ResourceTransitionInput): ResourceRecord {
    const current = this.repositories.getResource(input.resourceId);
    return executeIdempotent({
      db: this.dependencies.db,
      toolName: 'resource.record',
      commandId: input.commandId,
      ...(current ? { runId: current.runId } : {}),
      normalizedInput: { operation: 'transition', ...withoutCommandId(input) },
      clock: this.clock,
      mutate: () => {
        const resource = this.repositories.getResource(input.resourceId);
        if (!resource) throw new StateError('NOT_FOUND', 'resource not found');
        if (resource.version !== input.expectedVersion)
          throw new StateError(
            'VERSION_CONFLICT',
            'resource version does not match',
          );
        const coordinatedAllowed: Record<ResourceRecord['status'], string[]> = {
          intent_recorded: ['failed'],
          observed: [],
          attached: ['running', 'completed', 'failed', 'cleaned'],
          running: ['completed', 'failed', 'cleaned'],
          completed: ['cleaned'],
          failed: ['cleaned'],
          cleaned: [],
        };
        const observedAllowed: Record<ResourceRecord['status'], string[]> = {
          intent_recorded: [],
          observed: ['running', 'completed', 'failed'],
          attached: [],
          running: ['completed', 'failed'],
          completed: [],
          failed: [],
          cleaned: [],
        };
        const allowed =
          resource.control === 'coordinated'
            ? coordinatedAllowed[resource.status]
            : observedAllowed[resource.status];
        if (!allowed.includes(input.to))
          throw new StateError(
            'INVALID_TRANSITION',
            'resource transition is not allowed',
          );
        if (input.to === 'running' && !resource.nativeRef)
          throw new StateError(
            'INVALID_TRANSITION',
            'running resource requires nativeRef',
          );
        if (input.evidenceId) {
          const evidence = this.repositories.getEvidence(input.evidenceId);
          if (!evidence || evidence.runId !== resource.runId)
            throw new StateError('NOT_FOUND', 'evidence not found in run');
        }

        const updated = this.repositories.updateResource(
          resource.resourceId,
          input.expectedVersion,
          {
            status: input.to,
            cleanupRequired:
              input.to === 'cleaned' ? false : resource.cleanupRequired,
            lastError: input.error
              ? redactSensitiveText(input.error)
              : (resource.lastError ?? null),
            evidenceId: input.evidenceId ?? resource.evidenceId ?? null,
          },
          this.clock.nowIso(),
        );
        this.appendEvent(updated, 'resource.transitioned', input.commandId);
        return updated;
      },
    });
  }
}
