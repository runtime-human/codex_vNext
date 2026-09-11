import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { DatabaseSync } from 'node:sqlite';

const OUTPUT_PATH = path.resolve(
  'evidence/generated/ph03-candidate-sql-benchmark.json',
);
const LIMIT = 200;
const ITERATIONS = 40;
const WARMUP_ITERATIONS = 5;

const BASE_SCHEMA = `
CREATE TABLE context_items (
  context_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  logical_key TEXT NOT NULL,
  kind TEXT NOT NULL,
  scope TEXT NOT NULL,
  summary TEXT NOT NULL,
  source_uri TEXT NOT NULL,
  source_hash TEXT,
  git_sha TEXT,
  verified_at TEXT NOT NULL,
  stale INTEGER NOT NULL CHECK (stale IN (0, 1)),
  replaces_context_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
CREATE UNIQUE INDEX idx_context_logical_version
  ON context_items(project_id, logical_key, ifnull(source_hash, ''));
CREATE INDEX idx_context_project_stale_updated
  ON context_items(project_id, stale, updated_at DESC);
CREATE INDEX idx_context_project_scope
  ON context_items(project_id, scope);
CREATE INDEX idx_context_project_source
  ON context_items(project_id, source_uri);
`;

const EXTRA_INDEX = `
CREATE INDEX idx_context_project_stale_updated_id
  ON context_items(project_id, stale, updated_at DESC, context_id ASC);
`;

const QUERY_A = `SELECT * FROM context_items
  WHERE project_id = ?
  ORDER BY updated_at DESC, context_id ASC
  LIMIT ?`;
const QUERY_BC = `SELECT * FROM context_items
  WHERE project_id = ? AND stale = 0
  ORDER BY updated_at DESC, context_id ASC
  LIMIT ?`;

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * fraction) - 1),
  );
  return sorted[index];
}

function summarize(values) {
  return {
    medianMs: percentile(values, 0.5),
    p95Ms: percentile(values, 0.95),
  };
}

function staleFor(profile, index, count) {
  if (profile === 'fresh') return false;
  if (profile === 'quarter') return index % 4 === 0;
  if (profile === 'ninety') return index % 10 !== 0;
  if (profile === 'head200') return index >= Math.max(0, count - LIMIT);
  throw new Error(`unknown stale profile: ${profile}`);
}

function rowsFor(count, profile) {
  return Array.from({ length: count }, (_, index) => {
    const suffix = String(index).padStart(8, '0');
    return {
      contextId: `context-${suffix}`,
      projectId: 'project-benchmark',
      logicalKey: `logical-${suffix}`,
      kind: 'source_pointer',
      scope: index % 2 === 0 ? 'src/context' : 'src/context/sub',
      summary: `candidate summary ${suffix}`,
      sourceUri: `repo:src/file-${suffix}.ts`,
      sourceHash: 'a'.repeat(64),
      verifiedAt: suffix,
      stale: staleFor(profile, index, count),
      createdAt: suffix,
      updatedAt: suffix,
    };
  });
}

function expectedIds(rows) {
  return rows
    .filter((row) => !row.stale)
    .sort((left, right) => {
      if (left.updatedAt !== right.updatedAt) {
        return left.updatedAt > right.updatedAt ? -1 : 1;
      }
      return left.contextId.localeCompare(right.contextId);
    })
    .slice(0, LIMIT)
    .map((row) => row.contextId);
}

function createDatabase(rows, withExtraIndex) {
  const started = performance.now();
  const db = new DatabaseSync(':memory:');
  db.exec(BASE_SCHEMA);
  if (withExtraIndex) db.exec(EXTRA_INDEX);
  const insert = db.prepare(`INSERT INTO context_items (
    context_id, project_id, logical_key, kind, scope, summary,
    source_uri, source_hash, git_sha, verified_at, stale,
    replaces_context_id, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  db.exec('BEGIN');
  try {
    for (const row of rows) {
      insert.run(
        row.contextId,
        row.projectId,
        row.logicalKey,
        row.kind,
        row.scope,
        row.summary,
        row.sourceUri,
        row.sourceHash,
        null,
        row.verifiedAt,
        row.stale ? 1 : 0,
        null,
        row.createdAt,
        row.updatedAt,
      );
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    db.close();
    throw error;
  }

  const pageCount = Number(
    db.prepare('PRAGMA page_count').get().page_count,
  );
  const pageSize = Number(db.prepare('PRAGMA page_size').get().page_size);
  return {
    db,
    buildMs: performance.now() - started,
    pageBytes: pageCount * pageSize,
  };
}

function ids(result) {
  return result.map((row) => row.context_id);
}

function sameIds(left, right) {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function explain(db, sql) {
  return db
    .prepare(`EXPLAIN QUERY PLAN ${sql}`)
    .all('project-benchmark', LIMIT)
    .map((row) => String(row.detail));
}

function measure(statement) {
  for (let index = 0; index < WARMUP_ITERATIONS; index += 1) {
    statement.all('project-benchmark', LIMIT);
  }
  const durations = [];
  for (let index = 0; index < ITERATIONS; index += 1) {
    const started = performance.now();
    statement.all('project-benchmark', LIMIT);
    durations.push(performance.now() - started);
  }
  return summarize(durations);
}

function runScenario(count, profile) {
  const rows = rowsFor(count, profile);
  const oracle = expectedIds(rows);
  const current = createDatabase(rows, false);
  const indexed = createDatabase(rows, true);
  try {
    const statementA = current.db.prepare(QUERY_A);
    const statementB = current.db.prepare(QUERY_BC);
    const statementC = indexed.db.prepare(QUERY_BC);
    const idsA = ids(statementA.all('project-benchmark', LIMIT));
    const idsB = ids(statementB.all('project-benchmark', LIMIT));
    const idsC = ids(statementC.all('project-benchmark', LIMIT));
    return {
      count,
      profile,
      eligibleCount: rows.filter((row) => !row.stale).length,
      correctness: {
        A: sameIds(idsA, oracle),
        B: sameIds(idsB, oracle),
        C: sameIds(idsC, oracle),
      },
      query: {
        A: measure(statementA),
        B: measure(statementB),
        C: measure(statementC),
      },
      database: {
        current: {
          buildMs: current.buildMs,
          pageBytes: current.pageBytes,
        },
        extraIndex: {
          buildMs: indexed.buildMs,
          pageBytes: indexed.pageBytes,
        },
      },
      plan: {
        A: explain(current.db, QUERY_A),
        B: explain(current.db, QUERY_BC),
        C: explain(indexed.db, QUERY_BC),
      },
    };
  } finally {
    current.db.close();
    indexed.db.close();
  }
}

const scenarios = [];
for (const count of [201, 2_000, 10_000]) {
  for (const profile of ['fresh', 'quarter', 'ninety', 'head200']) {
    scenarios.push(runScenario(count, profile));
  }
}

const mismatchCount = (strategy) =>
  scenarios.filter((scenario) => !scenario.correctness[strategy]).length;
const totals = {
  A: { mismatches: mismatchCount('A') },
  B: { mismatches: mismatchCount('B') },
  C: { mismatches: mismatchCount('C') },
};

if (totals.B.mismatches !== 0 || totals.C.mismatches !== 0) {
  throw new Error(
    `eligible SQL candidate mismatch: B=${totals.B.mismatches}, C=${totals.C.mismatches}`,
  );
}

const evidence = {
  benchmarkVersion: 1,
  phase: 'PH-03',
  benchmark: 'candidate-sql-strategy',
  environment: {
    platform: process.platform,
    arch: process.arch,
    node: process.version,
  },
  iterations: ITERATIONS,
  limit: LIMIT,
  strategies: {
    A: 'current raw project LIMIT before persisted-stale exclusion',
    B: 'stale=0 eligibility predicate using existing PH-03 indexes',
    C: 'stale=0 eligibility predicate plus dedicated ordering index',
  },
  totals,
  scenarios,
};

await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
await writeFile(OUTPUT_PATH, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify(evidence, null, 2));
