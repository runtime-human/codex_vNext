import {
  type CompanionHydrationCapsule,
  CompanionHydrationCapsuleSchema,
  type ContextFreshness,
  type ContextItem,
  type ContextKind,
  type ContextQueryHit,
  type ContextQueryResult,
  ContextQuerySchema,
  type ContextStaleReason,
} from '../domain/context.js';
import type {
  ContextRecord,
  ContextRepository,
} from '../state/context-repository.js';
import { StateError } from '../state/errors.js';
import type { StateRepositories } from '../state/repositories.js';
import type { ContextSourceSnapshot } from './source-resolver.js';

const MAX_CONTEXT_CANDIDATES = 200;
const MAX_HYDRATION_CONTEXT_ITEMS = 10;
const MAX_HYDRATION_TOTAL_CHARS = 14_000;

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

interface RankingQuery {
  scopes?: string[];
  terms?: string[];
}

interface FreshnessResult {
  freshness: ContextFreshness;
  staleReason: ContextStaleReason;
}

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

export class ContextIndexService {
  constructor(private readonly dependencies: ContextIndexServiceDependencies) {}

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
    const candidates = this.dependencies.contexts
      .listCandidates(query.projectId, MAX_CONTEXT_CANDIDATES)
      .filter(
        (candidate) =>
          query.kinds.length === 0 || query.kinds.includes(candidate.kind),
      );

    const hits: ContextQueryHit[] = [];
    for (const candidate of candidates) {
      const freshness = await this.resolveFreshness(candidate);
      if (
        !shouldInclude(
          freshness.freshness,
          query.includeStale,
          query.includeUnverifiable,
        )
      ) {
        continue;
      }
      hits.push({
        item: toContextItem(candidate),
        ...freshness,
        score: scoreContextCandidate(candidate, query),
      });
    }
    hits.sort(compareHits);

    return {
      projectId: query.projectId,
      hits: hits.slice(0, query.limit),
      truncated:
        hits.length > query.limit ||
        this.dependencies.contexts.listCandidates(query.projectId, 201)
          .length >= MAX_CONTEXT_CANDIDATES,
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
