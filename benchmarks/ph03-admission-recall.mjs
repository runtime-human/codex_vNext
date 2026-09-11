import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { DatabaseSync } from 'node:sqlite';

import { scoreContextCandidate } from '../dist/context/context-index-service.js';

const OUTPUT_PATH = path.resolve(
  'evidence/generated/ph03-admission-recall-stress.json',
);
const CANDIDATE_LIMIT = 200;
const RESULT_LIMIT = 8;
const ITERATIONS = 12;
const WARMUP = 3;

const SCHEMA = `
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
  stale INTEGER NOT NULL,
  replaces_context_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
CREATE INDEX idx_context_project_stale_updated
  ON context_items(project_id, stale, updated_at DESC);
CREATE INDEX idx_context_project_scope
  ON context_items(project_id, scope);
CREATE INDEX idx_context_project_source
  ON context_items(project_id, source_uri);
`;

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

function summarize(values) {
  return {
    medianMs: percentile(values, 0.5),
    p95Ms: percentile(values, 0.95),
  };
}

function compareHits(left, right) {
  if (left.score !== right.score) return right.score - left.score;
  if (left.item.verifiedAt !== right.item.verifiedAt) {
    return left.item.verifiedAt > right.item.verifiedAt ? -1 : 1;
  }
  return left.item.contextId.localeCompare(right.item.contextId);
}

function rankedIds(rows, query) {
  return rows
    .map((item) => ({ item, score: scoreContextCandidate(item, query) }))
    .sort(compareHits)
    .slice(0, RESULT_LIMIT)
    .map((hit) => hit.item.contextId);
}

function recall(actual, oracle) {
  const expected = new Set(oracle);
  return actual.filter((id) => expected.has(id)).length / Math.max(1, oracle.length);
}

function rowsFor(count, scenario) {
  return Array.from({ length: count }, (_, index) => {
    const suffix = String(index).padStart(8, '0');
    const target = index === 7;
    const ageOrder = String(index).padStart(12, '0');
    let scope = `src/noise/${index % 64}`;
    let summary = `routine context ${suffix}`;
    let sourceUri = `repo:src/noise/file-${suffix}.ts`;
    if (target) {
      if (scenario === 'scope-old' || scenario === 'mixed-old') {
        scope = 'src/critical';
      }
      if (scenario === 'source-term-old' || scenario === 'mixed-old') {
        sourceUri = `repo:src/needle-critical-${suffix}.ts`;
      }
      if (scenario === 'summary-term-old' || scenario === 'mixed-old') {
        summary = `needle-critical invariant ${suffix}`;
      }
    }
    return {
      contextId: `context-${suffix}`,
      projectId: 'project-benchmark',
      logicalKey: `logical-${suffix}`,
      kind: 'source_pointer',
      scope,
      summary,
      sourceUri,
      sourceHash: 'a'.repeat(64),
      verifiedAt: ageOrder,
      stale: false,
      createdAt: ageOrder,
      updatedAt: ageOrder,
    };
  });
}

function createDatabase(rows) {
  const db = new DatabaseSync(':memory:');
  db.exec(SCHEMA);
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
        0,
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
  return db;
}

function toRecord(row) {
  return {
    contextId: row.context_id,
    projectId: row.project_id,
    logicalKey: row.logical_key,
    kind: row.kind,
    scope: row.scope,
    summary: row.summary,
    sourceUri: row.source_uri,
    sourceHash: row.source_hash ?? undefined,
    verifiedAt: row.verified_at,
    stale: row.stale === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function recent(db, limit) {
  return db
    .prepare(`SELECT * FROM context_items
      WHERE project_id = ? AND stale = 0 AND kind = ?
      ORDER BY updated_at DESC, context_id ASC LIMIT ?`)
    .all('project-benchmark', 'source_pointer', limit)
    .map(toRecord);
}

function exactScope(db, scope, limit) {
  return db
    .prepare(`SELECT * FROM context_items
      WHERE project_id = ? AND stale = 0 AND kind = ? AND scope = ?
      ORDER BY updated_at DESC, context_id ASC LIMIT ?`)
    .all('project-benchmark', 'source_pointer', scope, limit)
    .map(toRecord);
}

function childScope(db, scope, limit) {
  const prefix = `${scope}/`;
  return db
    .prepare(`SELECT * FROM context_items
      WHERE project_id = ? AND stale = 0 AND kind = ?
        AND scope >= ? AND scope < ?
      ORDER BY updated_at DESC, context_id ASC LIMIT ?`)
    .all('project-benchmark', 'source_pointer', prefix, `${prefix}\uffff`, limit)
    .map(toRecord);
}

function termLane(db, term, column, limit) {
  if (column !== 'source_uri' && column !== 'summary') throw new Error('invalid column');
  return db
    .prepare(`SELECT * FROM context_items
      WHERE project_id = ? AND stale = 0 AND kind = ?
        AND instr(lower(${column}), ?) > 0
      ORDER BY updated_at DESC, context_id ASC LIMIT ?`)
    .all('project-benchmark', 'source_pointer', term, limit)
    .map(toRecord);
}

function dedupeBounded(lanes) {
  const seen = new Set();
  const result = [];
  for (const lane of lanes) {
    for (const row of lane) {
      if (seen.has(row.contextId)) continue;
      seen.add(row.contextId);
      result.push(row);
      if (result.length >= CANDIDATE_LIMIT) return result;
    }
  }
  return result;
}

function admissionA(db) {
  return recent(db, CANDIDATE_LIMIT);
}

function admissionB(db, query) {
  const lanes = [];
  for (const scope of query.scopes ?? []) {
    lanes.push(exactScope(db, scope, 80), childScope(db, scope, 60));
  }
  lanes.push(recent(db, CANDIDATE_LIMIT));
  return dedupeBounded(lanes);
}

function admissionC(db, query) {
  const lanes = [];
  for (const scope of query.scopes ?? []) {
    lanes.push(exactScope(db, scope, 64), childScope(db, scope, 48));
  }
  for (const term of query.terms ?? []) {
    lanes.push(termLane(db, term, 'source_uri', 40));
    lanes.push(termLane(db, term, 'summary', 24));
  }
  lanes.push(recent(db, CANDIDATE_LIMIT));
  return dedupeBounded(lanes);
}

function queryFor(scenario) {
  return {
    scopes:
      scenario === 'scope-old' || scenario === 'mixed-old'
        ? ['src/critical']
        : [],
    terms:
      scenario === 'source-term-old' ||
      scenario === 'summary-term-old' ||
      scenario === 'mixed-old'
        ? ['needle-critical']
        : [],
  };
}

function measure(fn) {
  for (let i = 0; i < WARMUP; i += 1) fn();
  const values = [];
  for (let i = 0; i < ITERATIONS; i += 1) {
    const started = performance.now();
    fn();
    values.push(performance.now() - started);
  }
  return summarize(values);
}

function runScenario(count, scenario) {
  const rows = rowsFor(count, scenario);
  const db = createDatabase(rows);
  try {
    const query = queryFor(scenario);
    const oracle = rankedIds(rows, query);
    const strategies = {
      A: () => admissionA(db),
      B: () => admissionB(db, query),
      C: () => admissionC(db, query),
    };
    const result = { count, scenario, oracle, strategies: {} };
    for (const [name, admission] of Object.entries(strategies)) {
      const candidates = admission();
      const ranked = rankedIds(candidates, query);
      result.strategies[name] = {
        recallAt8: recall(ranked, oracle),
        candidateCount: candidates.length,
        containsTarget: candidates.some((row) => row.contextId === 'context-00000007'),
        timing: measure(admission),
      };
    }
    return result;
  } finally {
    db.close();
  }
}

const scenarios = [];
for (const count of [2_000, 10_000, 100_000]) {
  for (const scenario of [
    'scope-old',
    'source-term-old',
    'summary-term-old',
    'mixed-old',
  ]) {
    scenarios.push(runScenario(count, scenario));
  }
}

const aggregate = {};
for (const name of ['A', 'B', 'C']) {
  const recalls = scenarios.map((scenario) => scenario.strategies[name].recallAt8);
  aggregate[name] = {
    meanRecallAt8: recalls.reduce((sum, value) => sum + value, 0) / recalls.length,
    perfectRecallScenarios: recalls.filter((value) => value === 1).length,
    targetAdmissionScenarios: scenarios.filter(
      (scenario) => scenario.strategies[name].containsTarget,
    ).length,
  };
}

const evidence = {
  benchmarkVersion: 1,
  phase: 'PH-03',
  benchmark: 'relevance-admission-recall-stress',
  environment: {
    platform: process.platform,
    arch: process.arch,
    node: process.version,
  },
  candidateLimit: CANDIDATE_LIMIT,
  resultLimit: RESULT_LIMIT,
  strategies: {
    A: 'current kind-filtered recent-200',
    B: 'bounded exact/child scope lanes plus recent fallback',
    C: 'scope lanes plus source/summary substring term lanes plus recent fallback',
  },
  aggregate,
  scenarios,
};

await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
await writeFile(OUTPUT_PATH, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify(evidence, null, 2));
