import { createHash } from 'node:crypto';

import {
  type CompanionHydrationCapsule,
  CompanionHydrationCapsuleSchema,
  type ContextDelta,
  type ContextDeltaItem,
  ContextDeltaSchema,
  type ContextFreshness,
  type ContextItem,
  type ContextKind,
  type ContextQueryHit,
  type ContextQueryResult,
  ContextQuerySchema,
  type ContextStaleReason,
} from '../domain/context.js';
import { canonicalJson, hashMutationRequest } from '../state/canonical-json.js';
import { type Clock, systemClock } from '../state/clock.js';
import type {
  ContextRecord,
  ContextRepository,
} from '../state/context-repository.js';
import { StateError } from '../state/errors.js';
import { executeIdempotent } from '../state/idempotency.js';
import { newContextId, newEventId } from '../state/ids.js';
import { redactSensitiveText } from '../state/redaction.js';
import type { StateRepositories } from '../state/repositories.js';
import type { ContextSourceSnapshot } from './source-resolver.js';

const MAX_CONTEXT_CANDIDATES = 200;
const MAX_HYDRATION_CONTEXT_ITEMS = 10;
const MAX_HYDRATION_TOTAL_CHARS = 14_000;
const MAX_CONTEXT_SUMMARY_CHARS = 1600;
const INGEST_TOOL_NAME = 'context.ingest_delta';

export interface ContextSourceResolverLike {
  resolve(input: {
    projectId: string;
    sourceUri: string;
  }): Promise<ContextSourceSnapshot>;
}

export interface ContextIndexServiceDependencies {
  contexts: ContextRepository;
  repositories: StateRepositories;
  sourceResolver: ContextSourceResolverLike;
  clock?: Clock;
}

export interface ContextGetInput {
  projectId: string;
  contextId: string;
  includeStale?: boolean;
  includeUnverifiable?: boolean;
}

export interface ContextHydrateInput {
  taskId: string;
  projectId: string;
  runId: string;
  scopes?: string[];
  kinds?: ContextKind[];
  terms?: string[];
  decisionIds?: string[];
  evidenceIds?: string[];
  unresolvedQuestions?: string[];
}

export interface ContextIngestDeltaInput {
  commandId: string;
  projectId: string;
  runId: string;
  expectedTaskId: string;
  delta: ContextDelta;
}

export interface ContextIngestDeltaResult {
  projectId: string;
  runId: string;
  taskId: string;
  insertedContextIds: string[];
  staleContextIds: string[];
  acceptedItems: number;
  unresolvedQuestions: string[];
}

interface RankingQuery {
  scopes?: string[];
  terms?: string[];
}

interface FreshnessResult {
  freshness: ContextFreshness;
  staleReason: ContextStaleReason;
}

type PreparedDeltaMutation =
  | {
      type: 'insert';
      record: ContextRecord;
      stalePriorContextIds: string[];
    }
  | {
      type: 'stale';
      contextId: string;
      expectedSourceHash?: string;
    }
  | { type: 'none' };

function normalizeText(value: string): string {
  return value.normalize('NFKC').toLowerCase().trim();
}

function normalizedTerms(terms: string[] | undefined): string[] {
  const seen = new Set<string>();
  for (const term of terms ?? []) {
    const normalized = normalizeText(term);
    if (normalized) seen.add(normalized);
  }
  return [...seen];
}

function termScore(
  value: string,
  terms: string[],
  pointsPerTerm: number,
  maxPoints: number,
): number {
  const normalizedValue = normalizeText(value);
  let matches = 0;
  for (const term of terms) {
    if (normalizedValue.includes(term)) matches += 1;
  }
  return Math.min(matches * pointsPerTerm, maxPoints);
}

export function scoreContextCandidate(
  item: Pick<ContextRecord, 'scope' | 'summary' | 'sourceUri' | 'stale'>,
  query: RankingQuery,
): number {
  let score = 0;
  const scopes = query.scopes ?? [];
  if (scopes.some((scope) => item.scope === scope)) {
    score += 100;
  } else if (scopes.some((scope) => item.scope.startsWith(`${scope}/`))) {
    score += 60;
  }

  const terms = normalizedTerms(query.terms);
  score += termScore(item.sourceUri, terms, 20, 80);
  score += termScore(item.scope, terms, 15, 60);
  score += termScore(item.summary, terms, 5, 20);
  if (!item.stale) score += 10;
  return score;
}

function toContextItem(record: ContextRecord): ContextItem {
  return {
    contextId: record.contextId,
    projectId: record.projectId,
    kind: record.kind,
    scope: record.scope,
    summary: record.summary,
    sourceUri: record.sourceUri,
    ...(record.sourceHash ? { sourceHash: record.sourceHash } : {}),
    ...(record.gitSha ? { gitSha: record.gitSha } : {}),
    verifiedAt: record.verifiedAt,
    stale: record.stale,
  };
}

function shouldInclude(
  freshness: ContextFreshness,
  includeStale: boolean,
  includeUnverifiable: boolean,
): boolean {
  if (freshness === 'stale') return includeStale;
  if (freshness === 'unverifiable') return includeUnverifiable;
  return true;
}

function compareHits(left: ContextQueryHit, right: ContextQueryHit): number {
  if (left.score !== right.score) return right.score - left.score;
  if (left.item.verifiedAt !== right.item.verifiedAt) {
    return left.item.verifiedAt > right.item.verifiedAt ? -1 : 1;
  }
  if (left.item.contextId === right.item.contextId) return 0;
  return left.item.contextId < right.item.contextId ? -1 : 1;
}

function boundHydrationItems(items: ContextItem[]): ContextItem[] {
  const bounded: ContextItem[] = [];
  let remaining = MAX_HYDRATION_TOTAL_CHARS;
  for (const item of items.slice(0, MAX_HYDRATION_CONTEXT_ITEMS)) {
    if (remaining <= 0) break;
    if (item.summary.length <= remaining) {
      bounded.push(item);
      remaining -= item.summary.length;
      continue;
    }
    bounded.push({ ...item, summary: item.summary.slice(0, remaining) });
    remaining = 0;
  }
  return bounded;
}

function contextLogicalKey(input: {
  projectId: string;
  kind: ContextKind;
  scope: string;
  sourceUri: string;
}): string {
  return createHash('sha256').update(canonicalJson(input)).digest('hex');
}

function normalizedIngestInput(
  input: Omit<ContextIngestDeltaInput, 'delta'> & { delta: ContextDelta },
) {
  return {
    projectId: input.projectId,
    runId: input.runId,
    expectedTaskId: input.expectedTaskId,
    delta: input.delta,
  };
}

export class ContextIndexService {
  private readonly clock: Clock;

  constructor(private readonly dependencies: ContextIndexServiceDependencies) {
    this.clock = dependencies.clock ?? systemClock;
  }

  async get(input: ContextGetInput): Promise<ContextQueryHit | undefined> {
    const record = this.dependencies.contexts.get(
      input.projectId,
      input.contextId,
    );
    if (!record) return undefined;

    const freshness = await this.resolveFreshness(record);
    if (
      !shouldInclude(
        freshness.freshness,
        input.includeStale ?? false,
        input.includeUnverifiable ?? false,
      )
    ) {
      return undefined;
    }

    return {
      item: toContextItem(record),
      ...freshness,
      score: scoreContextCandidate(record, {}),
    };
  }

  async query(input: {
    projectId: string;
    scopes?: string[];
    kinds?: ContextKind[];
    terms?: string[];
    includeStale?: boolean;
    includeUnverifiable?: boolean;
    limit?: number;
  }): Promise<ContextQueryResult> {
    const query = ContextQuerySchema.parse(input);
    const rawCandidates = this.dependencies.contexts.listCandidates(
      query.projectId,
      MAX_CONTEXT_CANDIDATES,
      query.includeStale,
      query.kinds,
    );
    const candidateLimitReached =
      rawCandidates.length >= MAX_CONTEXT_CANDIDATES;
    const ranked = rawCandidates
      .filter(
        (candidate) =>
          query.kinds.length === 0 || query.kinds.includes(candidate.kind),
      )
      .map((candidate) => ({
        candidate,
        hit: {
          item: toContextItem(candidate),
          freshness: 'fresh' as const,
          staleReason: 'none' as const,
          score: scoreContextCandidate(candidate, query),
        },
      }))
      .sort((left, right) => compareHits(left.hit, right.hit));

    const hits: ContextQueryHit[] = [];
    for (const rankedCandidate of ranked) {
      const freshness = await this.resolveFreshness(rankedCandidate.candidate);
      if (
        shouldInclude(
          freshness.freshness,
          query.includeStale,
          query.includeUnverifiable,
        )
      ) {
        hits.push({ ...rankedCandidate.hit, ...freshness });
      }
      const enoughEvidence = candidateLimitReached
        ? hits.length >= query.limit
        : hits.length > query.limit;
      if (enoughEvidence) break;
    }

    return {
      projectId: query.projectId,
      hits: hits.slice(0, query.limit),
      truncated: candidateLimitReached || hits.length > query.limit,
    };
  }

  async hydrate(
    input: ContextHydrateInput,
  ): Promise<CompanionHydrationCapsule> {
    const run = this.dependencies.repositories.getRun(input.runId);
    if (!run || run.projectId !== input.projectId) {
      throw new StateError('NOT_FOUND', 'run not found for project');
    }

    const decisionIds = input.decisionIds ?? [];
    for (const decisionId of decisionIds) {
      const decision = this.dependencies.repositories.getDecision(decisionId);
      if (!decision || decision.runId !== run.runId) {
        throw new StateError('NOT_FOUND', 'decision not found for run');
      }
    }

    const evidenceIds = input.evidenceIds ?? [];
    for (const evidenceId of evidenceIds) {
      const evidence = this.dependencies.repositories.getEvidence(evidenceId);
      if (!evidence || evidence.runId !== run.runId) {
        throw new StateError('NOT_FOUND', 'evidence not found for run');
      }
    }

    const query = await this.query({
      projectId: input.projectId,
      ...(input.scopes ? { scopes: input.scopes } : {}),
      ...(input.kinds ? { kinds: input.kinds } : {}),
      ...(input.terms ? { terms: input.terms } : {}),
      includeStale: false,
      includeUnverifiable: false,
      limit: MAX_HYDRATION_CONTEXT_ITEMS,
    });

    return CompanionHydrationCapsuleSchema.parse({
      capsuleVersion: 1,
      taskId: input.taskId,
      projectId: input.projectId,
      runId: run.runId,
      objective: run.objective,
      ...(run.lastObservedRepoHead || run.repoHeadAtStart
        ? { repoHead: run.lastObservedRepoHead ?? run.repoHeadAtStart }
        : {}),
      contextItems: boundHydrationItems(query.hits.map((hit) => hit.item)),
      relevantDecisionIds: decisionIds,
      evidenceIds,
      unresolvedQuestions: input.unresolvedQuestions ?? [],
    });
  }

  async ingestDelta(
    input: ContextIngestDeltaInput,
  ): Promise<ContextIngestDeltaResult> {
    if (!input.commandId.trim()) {
      throw new StateError('INVALID_ARGUMENT', 'commandId is required');
    }

    const parsedDelta = ContextDeltaSchema.parse(input.delta);
    const normalizedInput = normalizedIngestInput({
      ...input,
      delta: parsedDelta,
    });
    const replay = this.readExistingReceipt<ContextIngestDeltaResult>(
      input.commandId,
      normalizedInput,
    );
    if (replay) return replay;

    const run = this.dependencies.repositories.getRun(input.runId);
    if (!run || run.projectId !== input.projectId) {
      throw new StateError('NOT_FOUND', 'run not found for project');
    }
    if (parsedDelta.taskId !== input.expectedTaskId) {
      throw new StateError(
        'INVALID_ARGUMENT',
        'context delta task does not match expected task',
      );
    }

    const currentRepoHead = run.lastObservedRepoHead ?? run.repoHeadAtStart;
    if (
      parsedDelta.baseRepoHead &&
      parsedDelta.baseRepoHead !== currentRepoHead
    ) {
      throw new StateError(
        'STALE_BASE',
        'context delta base repository head is stale',
        {
          reason: 'stale_base',
          baseRepoHead: parsedDelta.baseRepoHead,
          currentRepoHead: currentRepoHead ?? null,
        },
      );
    }

    const verifiedAt = this.clock.nowIso();
    const prepared: PreparedDeltaMutation[] = [];
    for (const item of parsedDelta.items) {
      const snapshot = await this.dependencies.sourceResolver.resolve({
        projectId: input.projectId,
        sourceUri: item.sourceUri,
      });
      prepared.push(
        this.prepareDeltaMutation(input.projectId, item, snapshot, verifiedAt),
      );
    }

    return executeIdempotent({
      db: this.dependencies.contexts.db,
      toolName: INGEST_TOOL_NAME,
      commandId: input.commandId,
      runId: input.runId,
      normalizedInput,
      clock: this.clock,
      mutate: () => {
        const insertedContextIds: string[] = [];
        const staleContextIds: string[] = [];

        for (const mutation of prepared) {
          if (mutation.type === 'none') continue;
          if (mutation.type === 'stale') {
            if (
              this.dependencies.contexts.markContextStale(
                input.projectId,
                mutation.contextId,
                mutation.expectedSourceHash,
                verifiedAt,
              )
            ) {
              staleContextIds.push(mutation.contextId);
            }
            continue;
          }

          this.dependencies.contexts.put(mutation.record);
          insertedContextIds.push(mutation.record.contextId);
          if (mutation.stalePriorContextIds.length > 0) {
            this.dependencies.contexts.markLogicalKeyStale(
              input.projectId,
              mutation.record.logicalKey,
              mutation.record.contextId,
              verifiedAt,
            );
            staleContextIds.push(...mutation.stalePriorContextIds);
          }
        }

        const uniqueStaleIds = [...new Set(staleContextIds)];
        const result: ContextIngestDeltaResult = {
          projectId: input.projectId,
          runId: input.runId,
          taskId: parsedDelta.taskId,
          insertedContextIds,
          staleContextIds: uniqueStaleIds,
          acceptedItems: parsedDelta.items.length,
          unresolvedQuestions: parsedDelta.unresolvedQuestions,
        };

        this.dependencies.repositories.appendEvent({
          eventId: newEventId(),
          runId: input.runId,
          entityType: 'run',
          entityId: input.runId,
          eventType: 'context.delta_ingested',
          payload: {
            taskId: parsedDelta.taskId,
            acceptedItems: parsedDelta.items.length,
            insertedContextIds,
            staleContextIds: uniqueStaleIds,
            unresolvedQuestionCount: parsedDelta.unresolvedQuestions.length,
          },
          commandId: input.commandId,
          createdAt: verifiedAt,
        });
        return result;
      },
    });
  }

  private readExistingReceipt<T>(
    commandId: string,
    normalizedInput: unknown,
  ): T | undefined {
    const receipt = this.dependencies.contexts.db
      .prepare(
        'SELECT tool_name, request_hash, result_json FROM command_receipts WHERE command_id = ?',
      )
      .get(commandId) as
      | { tool_name: string; request_hash: string; result_json: string }
      | undefined;
    if (!receipt) return undefined;

    const requestHash = hashMutationRequest(INGEST_TOOL_NAME, normalizedInput);
    if (
      receipt.tool_name !== INGEST_TOOL_NAME ||
      receipt.request_hash !== requestHash
    ) {
      throw new StateError(
        'IDEMPOTENCY_CONFLICT',
        'commandId was already used for a different mutation',
        { commandId },
      );
    }
    return JSON.parse(receipt.result_json) as T;
  }

  private prepareDeltaMutation(
    projectId: string,
    item: ContextDeltaItem,
    snapshot: ContextSourceSnapshot,
    verifiedAt: string,
  ): PreparedDeltaMutation {
    const logicalKey = contextLogicalKey({
      projectId,
      kind: item.contextKind,
      scope: item.scope,
      sourceUri: item.sourceUri,
    });

    if (item.kind === 'stale') {
      const candidates = this.dependencies.contexts
        .listByLogicalKey(projectId, logicalKey)
        .filter(
          (candidate) =>
            !item.sourceHash || candidate.sourceHash === item.sourceHash,
        );
      const requestedContextId = item.contextId ?? item.replacesContextId;
      const target = requestedContextId
        ? this.dependencies.contexts.get(projectId, requestedContextId)
        : candidates.length === 1
          ? candidates[0]
          : undefined;
      if (
        !target ||
        target.logicalKey !== logicalKey ||
        (item.sourceHash && target.sourceHash !== item.sourceHash)
      ) {
        throw new StateError(
          'NOT_FOUND',
          'stale context target not found for project and source version',
        );
      }
      return {
        type: 'stale',
        contextId: target.contextId,
        ...(item.sourceHash ? { expectedSourceHash: item.sourceHash } : {}),
      };
    }

    if (snapshot.status === 'missing' || snapshot.status === 'unresolvable') {
      throw new StateError(
        'INVALID_ARGUMENT',
        'context delta source cannot be verified',
        { sourceUri: item.sourceUri, sourceStatus: snapshot.status },
      );
    }
    if (
      snapshot.status === 'resolved' &&
      item.sourceHash &&
      snapshot.sourceHash !== item.sourceHash
    ) {
      throw new StateError(
        'INVALID_ARGUMENT',
        'context delta source hash does not match current source',
        { sourceUri: item.sourceUri },
      );
    }

    if (item.kind === 'relevant' || item.kind === 'decision_needed') {
      return { type: 'none' };
    }

    const sourceHash =
      snapshot.status === 'resolved' ? snapshot.sourceHash : undefined;
    if (!sourceHash && item.sourceUri.startsWith('repo:')) {
      throw new StateError(
        'INVALID_ARGUMENT',
        'repository context mutation requires a verified source hash',
      );
    }

    const sameVersion = this.dependencies.contexts
      .listByLogicalKey(projectId, logicalKey)
      .find((candidate) => (candidate.sourceHash ?? '') === (sourceHash ?? ''));
    if (sameVersion) {
      throw new StateError(
        'INVALID_ARGUMENT',
        'context source version is already indexed',
        { contextId: sameVersion.contextId },
      );
    }

    let replacesContextId: string | undefined;
    let stalePriorContextIds: string[] = [];
    if (item.kind === 'changed') {
      replacesContextId = item.replacesContextId ?? item.contextId;
      const replaced = replacesContextId
        ? this.dependencies.contexts.get(projectId, replacesContextId)
        : undefined;
      if (!replaced || replaced.logicalKey !== logicalKey) {
        throw new StateError(
          'NOT_FOUND',
          'changed context replacement not found for project and logical source',
        );
      }
      if ((replaced.sourceHash ?? '') === (sourceHash ?? '')) {
        throw new StateError(
          'INVALID_ARGUMENT',
          'changed context source hash is unchanged',
        );
      }
      stalePriorContextIds = this.dependencies.contexts
        .listByLogicalKey(projectId, logicalKey)
        .filter((candidate) => !candidate.stale)
        .map((candidate) => candidate.contextId);
    }

    const contextId = newContextId();
    return {
      type: 'insert',
      record: {
        contextId,
        projectId,
        logicalKey,
        kind: item.contextKind,
        scope: item.scope,
        summary: redactSensitiveText(item.summary).slice(
          0,
          MAX_CONTEXT_SUMMARY_CHARS,
        ),
        sourceUri: item.sourceUri,
        ...(sourceHash ? { sourceHash } : {}),
        ...(item.gitSha ? { gitSha: item.gitSha } : {}),
        verifiedAt,
        stale: false,
        ...(replacesContextId ? { replacesContextId } : {}),
        createdAt: verifiedAt,
        updatedAt: verifiedAt,
      },
      stalePriorContextIds,
    };
  }

  private async resolveFreshness(
    record: ContextRecord,
  ): Promise<FreshnessResult> {
    if (record.stale) {
      return { freshness: 'stale', staleReason: 'persisted_stale' };
    }

    const snapshot = await this.dependencies.sourceResolver.resolve({
      projectId: record.projectId,
      sourceUri: record.sourceUri,
    });
    if (snapshot.status === 'missing') {
      return { freshness: 'stale', staleReason: 'source_missing' };
    }
    if (snapshot.status === 'unresolvable') {
      return { freshness: 'stale', staleReason: 'source_unresolvable' };
    }
    if (snapshot.status === 'unverifiable') {
      return { freshness: 'unverifiable', staleReason: 'none' };
    }
    if (!record.sourceHash || snapshot.sourceHash !== record.sourceHash) {
      return { freshness: 'stale', staleReason: 'source_hash_changed' };
    }
    return { freshness: 'fresh', staleReason: 'none' };
  }
}
