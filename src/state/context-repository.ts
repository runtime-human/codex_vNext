import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';

import type { ContextKind } from '../domain/context.js';

const MAX_CONTEXT_CANDIDATES = 200;
const SINGLE_SCOPE_EXACT_LIMIT = 80;
const SINGLE_SCOPE_CHILD_LIMIT = 60;
const MULTI_SCOPE_RESERVOIR_LIMIT = 120;
const MAX_UNICODE_SUFFIX = '\u{10ffff}';

type Row = Record<string, SQLOutputValue>;

export interface ContextRecord {
  contextId: string;
  projectId: string;
  logicalKey: string;
  kind: ContextKind;
  scope: string;
  summary: string;
  sourceUri: string;
  sourceHash?: string;
  gitSha?: string;
  verifiedAt: string;
  stale: boolean;
  replacesContextId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContextScopeCandidatePool {
  items: ContextRecord[];
  truncated: boolean;
}

function text(row: Row, key: string): string {
  return row[key] as string;
}

function optionalText(row: Row, key: string): string | undefined {
  return (row[key] as string | null) ?? undefined;
}

function number(row: Row, key: string): number {
  return row[key] as number;
}

function contextFromRow(row: Row): ContextRecord {
  return {
    contextId: text(row, 'context_id'),
    projectId: text(row, 'project_id'),
    logicalKey: text(row, 'logical_key'),
    kind: text(row, 'kind') as ContextKind,
    scope: text(row, 'scope'),
    summary: text(row, 'summary'),
    sourceUri: text(row, 'source_uri'),
    ...(optionalText(row, 'source_hash')
      ? { sourceHash: text(row, 'source_hash') }
      : {}),
    ...(optionalText(row, 'git_sha') ? { gitSha: text(row, 'git_sha') } : {}),
    verifiedAt: text(row, 'verified_at'),
    stale: number(row, 'stale') === 1,
    ...(optionalText(row, 'replaces_context_id')
      ? { replacesContextId: text(row, 'replaces_context_id') }
      : {}),
    createdAt: text(row, 'created_at'),
    updatedAt: text(row, 'updated_at'),
  };
}

function boundedLimit(limit: number | undefined): number {
  if (limit === undefined) return MAX_CONTEXT_CANDIDATES;
  if (!Number.isSafeInteger(limit) || limit < 1) return 1;
  return Math.min(limit, MAX_CONTEXT_CANDIDATES);
}

function candidateFilter(
  projectId: string,
  includePersistedStale: boolean,
  kinds: ContextKind[],
): { predicates: string[]; parameters: SQLOutputValue[] } {
  const predicates = ['project_id = ?'];
  const parameters: SQLOutputValue[] = [projectId];
  if (!includePersistedStale) predicates.push('stale = 0');
  if (kinds.length > 0) {
    predicates.push(`kind IN (${kinds.map(() => '?').join(', ')})`);
    parameters.push(...kinds);
  }
  return { predicates, parameters };
}

export class ContextRepository {
  constructor(readonly db: DatabaseSync) {}

  put(value: ContextRecord): void {
    this.db
      .prepare(`INSERT INTO context_items (
        context_id, project_id, logical_key, kind, scope, summary,
        source_uri, source_hash, git_sha, verified_at, stale,
        replaces_context_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        value.contextId,
        value.projectId,
        value.logicalKey,
        value.kind,
        value.scope,
        value.summary,
        value.sourceUri,
        value.sourceHash ?? null,
        value.gitSha ?? null,
        value.verifiedAt,
        value.stale ? 1 : 0,
        value.replacesContextId ?? null,
        value.createdAt,
        value.updatedAt,
      );
  }

  get(projectId: string, contextId: string): ContextRecord | undefined {
    const row = this.db
      .prepare(
        'SELECT * FROM context_items WHERE project_id = ? AND context_id = ?',
      )
      .get(projectId, contextId) as Row | undefined;
    return row ? contextFromRow(row) : undefined;
  }

  getByLogicalVersion(
    projectId: string,
    logicalKey: string,
    sourceHash?: string,
  ): ContextRecord | undefined {
    const row = this.db
      .prepare(`SELECT * FROM context_items
        WHERE project_id = ? AND logical_key = ?
          AND ifnull(source_hash, '') = ?`)
      .get(projectId, logicalKey, sourceHash ?? '') as Row | undefined;
    return row ? contextFromRow(row) : undefined;
  }

  listCandidates(
    projectId: string,
    limit?: number,
    includePersistedStale = true,
    kinds: ContextKind[] = [],
  ): ContextRecord[] {
    const { predicates, parameters } = candidateFilter(
      projectId,
      includePersistedStale,
      kinds,
    );
    parameters.push(boundedLimit(limit));

    const sql = `SELECT * FROM context_items
      WHERE ${predicates.join(' AND ')}
      ORDER BY updated_at DESC, context_id ASC
      LIMIT ?`;
    return (this.db.prepare(sql).all(...parameters) as Row[]).map(
      contextFromRow,
    );
  }

  listScopeCandidates(
    projectId: string,
    scopes: string[],
    includePersistedStale = true,
    kinds: ContextKind[] = [],
  ): ContextScopeCandidatePool {
    const requestedScopes = [...new Set(scopes)].slice(0, 8);
    if (requestedScopes.length === 0) {
      return { items: [], truncated: false };
    }

    if (requestedScopes.length === 1) {
      const scope = requestedScopes[0];
      if (!scope) return { items: [], truncated: false };
      const exact = this.listScopeLane(
        projectId,
        includePersistedStale,
        kinds,
        'scope = ?',
        [scope],
        SINGLE_SCOPE_EXACT_LIMIT,
      );
      const prefix = `${scope}/`;
      const children = this.listScopeLane(
        projectId,
        includePersistedStale,
        kinds,
        'scope >= ? AND scope < ?',
        [prefix, `${prefix}${MAX_UNICODE_SUFFIX}`],
        SINGLE_SCOPE_CHILD_LIMIT,
      );
      return {
        items: [...exact, ...children],
        truncated:
          exact.length >= SINGLE_SCOPE_EXACT_LIMIT ||
          children.length >= SINGLE_SCOPE_CHILD_LIMIT,
      };
    }

    const { predicates, parameters } = candidateFilter(
      projectId,
      includePersistedStale,
      kinds,
    );
    const exactPlaceholders = requestedScopes.map(() => '?').join(', ');
    const childPredicates = requestedScopes
      .map(() => '(scope >= ? AND scope < ?)')
      .join(' OR ');
    predicates.push(`(scope IN (${exactPlaceholders}) OR ${childPredicates})`);
    parameters.push(...requestedScopes);
    for (const scope of requestedScopes) {
      const prefix = `${scope}/`;
      parameters.push(prefix, `${prefix}${MAX_UNICODE_SUFFIX}`);
    }
    parameters.push(...requestedScopes, MULTI_SCOPE_RESERVOIR_LIMIT);

    const rows = this.db
      .prepare(`SELECT * FROM context_items
        WHERE ${predicates.join(' AND ')}
        ORDER BY stale ASC,
          CASE WHEN scope IN (${exactPlaceholders}) THEN 0 ELSE 1 END,
          updated_at DESC, context_id ASC
        LIMIT ?`)
      .all(...parameters) as Row[];
    return {
      items: rows.map(contextFromRow),
      truncated: rows.length >= MULTI_SCOPE_RESERVOIR_LIMIT,
    };
  }

  listByLogicalKey(
    projectId: string,
    logicalKey: string,
    limit?: number,
  ): ContextRecord[] {
    return (
      this.db
        .prepare(`SELECT * FROM context_items
          WHERE project_id = ? AND logical_key = ?
          ORDER BY verified_at DESC, context_id ASC
          LIMIT ?`)
        .all(projectId, logicalKey, boundedLimit(limit)) as Row[]
    ).map(contextFromRow);
  }

  markLogicalKeyStale(
    projectId: string,
    logicalKey: string,
    exceptContextId: string | undefined,
    updatedAt: string,
  ): number {
    const result = exceptContextId
      ? this.db
          .prepare(`UPDATE context_items
            SET stale = 1, updated_at = ?
            WHERE project_id = ? AND logical_key = ?
              AND context_id <> ? AND stale = 0`)
          .run(updatedAt, projectId, logicalKey, exceptContextId)
      : this.db
          .prepare(`UPDATE context_items
            SET stale = 1, updated_at = ?
            WHERE project_id = ? AND logical_key = ? AND stale = 0`)
          .run(updatedAt, projectId, logicalKey);
    return Number(result.changes);
  }

  markContextStale(
    projectId: string,
    contextId: string,
    expectedSourceHash: string | undefined,
    updatedAt: string,
  ): boolean {
    const result = expectedSourceHash
      ? this.db
          .prepare(`UPDATE context_items
            SET stale = 1, updated_at = ?
            WHERE project_id = ? AND context_id = ?
              AND source_hash = ? AND stale = 0`)
          .run(updatedAt, projectId, contextId, expectedSourceHash)
      : this.db
          .prepare(`UPDATE context_items
            SET stale = 1, updated_at = ?
            WHERE project_id = ? AND context_id = ? AND stale = 0`)
          .run(updatedAt, projectId, contextId);
    return Number(result.changes) === 1;
  }

  private listScopeLane(
    projectId: string,
    includePersistedStale: boolean,
    kinds: ContextKind[],
    scopePredicate: string,
    scopeParameters: SQLOutputValue[],
    limit: number,
  ): ContextRecord[] {
    const { predicates, parameters } = candidateFilter(
      projectId,
      includePersistedStale,
      kinds,
    );
    predicates.push(scopePredicate);
    parameters.push(...scopeParameters, limit);
    return (
      this.db
        .prepare(`SELECT * FROM context_items
          WHERE ${predicates.join(' AND ')}
          ORDER BY stale ASC, updated_at DESC, context_id ASC
          LIMIT ?`)
        .all(...parameters) as Row[]
    ).map(contextFromRow);
  }
}
