import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { DatabaseSync } from 'node:sqlite';

const OUTPUT_PATH = path.resolve('evidence/generated/ph03-index-lifecycle-stress.json');
const ITERATIONS = 20;
const WARMUP = 4;

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

const FULL_COMPOSITE = `
CREATE INDEX idx_context_project_stale_kind_updated_id
  ON context_items(project_id, stale, kind, updated_at DESC, context_id ASC);
`;

const PARTIAL_ACTIVE = `
CREATE INDEX idx_context_active_kind_updated_id
  ON context_items(project_id, kind, updated_at DESC, context_id ASC)
  WHERE stale = 0;
`;

const QUERY = `SELECT context_id FROM context_items
  WHERE project_id = ? AND stale = 0 AND kind = ?
  ORDER BY updated_at DESC, context_id ASC
  LIMIT ?`;

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

function summarize(values) {
  return { medianMs: percentile(values, 0.5), p95Ms: percentile(values, 0.95) };
}

function openDb(filePath, strategy) {
  const db = new DatabaseSync(filePath);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;');
  db.exec(BASE_SCHEMA);
  if (strategy === 'B') db.exec(FULL_COMPOSITE);
  if (strategy === 'C') db.exec(PARTIAL_ACTIVE);
  return db;
}

function insertRows(db, count, staleRatio) {
  const insert = db.prepare(`INSERT INTO context_items (
    context_id, project_id, logical_key, kind, scope, summary,
    source_uri, source_hash, git_sha, verified_at, stale,
    replaces_context_id, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const started = performance.now();
  db.exec('BEGIN IMMEDIATE');
  try {
    for (let index = 0; index < count; index += 1) {
      const id = String(index).padStart(8, '0');
      const stale = index / count < staleRatio ? 1 : 0;
      const kind = index % 50 === 0 ? 'pitfall' : 'source_pointer';
      insert.run(
        `context-${id}`,
        'project-benchmark',
        `logical-${id}`,
        kind,
        `src/${index % 128}`,
        `summary ${id}`,
        `repo:src/file-${id}.ts`,
        id.padEnd(64, '0'),
        null,
        id,
        stale,
        null,
        id,
        id,
      );
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return performance.now() - started;
}

function markStale(db, count, fraction) {
  const cutoff = Math.floor(count * fraction);
  const started = performance.now();
  const result = db.prepare(`UPDATE context_items SET stale = 1, updated_at = updated_at
    WHERE project_id = ? AND stale = 0 AND CAST(substr(context_id, 9) AS INTEGER) < ?`)
    .run('project-benchmark', cutoff);
  return { ms: performance.now() - started, changed: Number(result.changes) };
}

function measureQuery(db) {
  const statement = db.prepare(QUERY);
  for (let i = 0; i < WARMUP; i += 1) statement.all('project-benchmark', 'pitfall', 12);
  const durations = [];
  for (let i = 0; i < ITERATIONS; i += 1) {
    const started = performance.now();
    statement.all('project-benchmark', 'pitfall', 12);
    durations.push(performance.now() - started);
  }
  return {
    timing: summarize(durations),
    plan: db.prepare(`EXPLAIN QUERY PLAN ${QUERY}`).all('project-benchmark', 'pitfall', 12).map((row) => String(row.detail)),
  };
}

async function fileBytes(filePath) {
  let total = 0;
  for (const suffix of ['', '-wal', '-shm']) {
    try { total += (await stat(`${filePath}${suffix}`)).size; } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return total;
}

async function runScenario(count, staleRatio, strategy, root) {
  const filePath = path.join(root, `${strategy}-${count}-${String(staleRatio).replace('.', '_')}.sqlite`);
  const db = openDb(filePath, strategy);
  try {
    const insertMs = insertRows(db, count, staleRatio);
    const beforeMutationBytes = await fileBytes(filePath);
    const queryBefore = measureQuery(db);
    const staleMutation = markStale(db, count, Math.min(0.9, staleRatio + 0.1));
    const queryAfter = measureQuery(db);
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    const afterCheckpointBytes = await fileBytes(filePath);
    return {
      count,
      staleRatio,
      strategy,
      insertMs,
      staleMutation,
      queryBefore,
      queryAfter,
      beforeMutationBytes,
      afterCheckpointBytes,
    };
  } finally {
    db.close();
  }
}

const root = await mkdtemp(path.join(tmpdir(), 'ph03-index-lifecycle-'));
try {
  const scenarios = [];
  for (const count of [10_000, 100_000]) {
    for (const staleRatio of [0, 0.5, 0.9]) {
      for (const strategy of ['A', 'B', 'C']) {
        scenarios.push(await runScenario(count, staleRatio, strategy, root));
      }
    }
  }
  const evidence = {
    benchmarkVersion: 1,
    phase: 'PH-03',
    benchmark: 'index-lifecycle-stress',
    environment: { platform: process.platform, arch: process.arch, node: process.version },
    strategies: {
      A: 'current indexes',
      B: 'current indexes plus full active/stale kind recency composite index',
      C: 'current indexes plus partial active-only kind recency index',
    },
    scenarios,
  };
  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await import('node:fs/promises').then(({ writeFile }) => writeFile(OUTPUT_PATH, `${JSON.stringify(evidence, null, 2)}\n`));
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  await rm(root, { recursive: true, force: true });
}
