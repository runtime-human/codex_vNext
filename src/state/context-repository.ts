import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';

import type { ContextKind } from '../domain/context.js';

const MAX_CONTEXT_CANDIDATES = 200;

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

  listCandidates(
    projectId: string,
    limit?: number,
    includePersistedStale = true,
  ): ContextRecord[] {
    const sql = includePersistedStale
      ? `SELECT * FROM context_items
          WHERE project_id = ?
          ORDER BY updated_at DESC, context_id ASC
          LIMIT ?`
      : `SELECT * FROM context_items
          WHERE project_id = ? AND stale = 0
          ORDER BY updated_at DESC, context_id ASC
          LIMIT ?`;
    return (
      this.db.prepare(sql).all(projectId, boundedLimit(limit)) as Row[]
    ).map(contextFromRow);
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
}
