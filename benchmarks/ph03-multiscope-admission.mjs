import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { DatabaseSync } from 'node:sqlite';

import { scoreContextCandidate } from '../dist/context/context-index-service.js';

const OUTPUT_PATH = path.resolve(
  'evidence/generated/ph03-multiscope-admission-stress.json',
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
  stale INTEGER NOT NULL CHECK (stale IN (0, 1)),
  replaces_context_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
CREATE INDEX idx_context_project_stale_updated
  ON context_items(project_id, stale, updated_at DESC);
CREATE INDEX idx_context_project_scope
  ON context_items(project_id, scope);
`;

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[
    Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)
  ];
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

function rankedIds(rows, scopes) {
  return rows
    .map((item) => ({
      item,
      score: scoreContextCandidate(item, { scopes, terms: [] }),
    }))
    .sort(compareHits)
    .slice(0, RESULT_LIMIT)
    .map((hit) => hit.item.contextId);
}

function recall(actual, oracle) {
  const expected = new Set(oracle);
  return (
    actual.filter((id) => expected.has(id)).length / Math.max(1, oracle.length)
  );
}

function requestedScopes(count) {
  return Array.from({ length: count }, (_, index) => `src/critical/${index}`);
}

function rowsFor(count, scopeCount, density) {
  const scopes = requestedScopes(scopeCount);
  return Array.from({ length: count }, (_, index) => {
    const suffix = String(index).padStart(8, '0');
    let scope = `src/noise/${index % 128}`;

    if (index < scopeCount) {
      scope = scopes[index];
    } else if (index >= scopeCount && index < scopeCount * 2) {
      scope = `${scopes[index - scopeCount]}/child`;
    } else if (density === 'dense' && index % 32 === 0) {
      const requested = scopes[index % scopeCount];
      scope = index % 64 === 0 ? requested : `${requested}/dense-child`;
    }

    return {
      contextId: `context-${suffix}`,
      projectId: 'project-benchmark',
      logicalKey: `logical-${suffix}`,
      kind: 'source_pointer',
      scope,
      summary: `summary ${suffix}`,
      sourceUri: `repo:src/file-${suffix}.ts`,
      sourceHash: 'a'.repeat(64),
      verifiedAt: suffix,
      stale: false,
      createdAt: suffix,
      updatedAt: suffix,
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
    .all(
      'project-benchmark',
      'source_pointer',
      prefix,
      `${prefix}\uffff`,
      limit,
    )
    .map(toRecord);
}

function combinedScope(db, scopes, limit) {
  const exactPlaceholders = scopes.map(() => '?').join(', ');
  const childPredicates = scopes
    .map(() => '(scope >= ? AND scope < ?)')
    .join(' OR ');
  const where = `(scope IN (${exactPlaceholders}) OR ${childPredicates})`;
  const order = `CASE WHEN scope IN (${exactPlaceholders}) THEN 0 ELSE 1 END`;
  const parameters = ['project-benchmark', 'source_pointer', ...scopes];
  for (const scope of scopes) {
    const prefix = `${scope}/`;
    parameters.push(prefix, `${prefix}\uffff`);
  }
  parameters.push(...scopes, limit);
  return db
    .prepare(`SELECT * FROM context_items
      WHERE project_id = ? AND stale = 0 AND kind = ? AND ${where}
      ORDER BY ${order}, updated_at DESC, context_id ASC LIMIT ?`)
    .all(...parameters)
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

function admissionB(db, scopes) {
  const lanes = [];
  for (const scope of scopes) {
    lanes.push(exactScope(db, scope, 80), childScope(db, scope, 60));
  }
  lanes.push(recent(db, CANDIDATE_LIMIT));
  return dedupeBounded(lanes);
}

function admissionC(db, scopes) {
  return dedupeBounded([
    combinedScope(db, scopes, 120),
    recent(db, CANDIDATE_LIMIT),
  ]);
}

function admissionD(db, scopes) {
  return dedupeBounded([
    combinedScope(db, scopes, 160),
    recent(db, CANDIDATE_LIMIT),
  ]);
}

function admissionE(db, scopes) {
  return scopes.length <= 1 ? admissionB(db, scopes) : admissionC(db, scopes);
}

function admissionF(db, scopes) {
  return scopes.length <= 2 ? admissionB(db, scopes) : admissionC(db, scopes);
}

function measure(fn) {
  for (let index = 0; index < WARMUP; index += 1) fn();
  const durations = [];
  for (let index = 0; index < ITERATIONS; index += 1) {
    const started = performance.now();
    fn();
    durations.push(performance.now() - started);
  }
  return summarize(durations);
}

function runScenario(count, scopeCount, density) {
  const scopes = requestedScopes(scopeCount);
  const rows = rowsFor(count, scopeCount, density);
  const db = createDatabase(rows);
  try {
    const oracle = rankedIds(rows, scopes);
    const strategies = {
      A: () => admissionA(db),
      B: () => admissionB(db, scopes),
      C: () => admissionC(db, scopes),
      D: () => admissionD(db, scopes),
      E: () => admissionE(db, scopes),
      F: () => admissionF(db, scopes),
    };
    const result = { count, scopeCount, density, oracle, strategies: {} };
    for (const [name, admission] of Object.entries(strategies)) {
      const candidates = admission();
      const ranked = rankedIds(candidates, scopes);
      result.strategies[name] = {
        recallAt8: recall(ranked, oracle),
        candidateCount: candidates.length,
        timing: measure(admission),
      };
    }
    return result;
  } finally {
    db.close();
  }
}

const scenarios = [];
for (const count of [10_000, 100_000]) {
  for (const scopeCount of [1, 2, 4, 8]) {
    for (const density of ['sparse', 'dense']) {
      scenarios.push(runScenario(count, scopeCount, density));
    }
  }
}

const aggregate = {};
for (const name of ['A', 'B', 'C', 'D', 'E', 'F']) {
  const recalls = scenarios.map(
    (scenario) => scenario.strategies[name].recallAt8,
  );
  const medians = scenarios.map(
    (scenario) => scenario.strategies[name].timing.medianMs,
  );
  const p95s = scenarios.map(
    (scenario) => scenario.strategies[name].timing.p95Ms,
  );
  aggregate[name] = {
    meanRecallAt8:
      recalls.reduce((sum, value) => sum + value, 0) / recalls.length,
    perfectRecallScenarios: recalls.filter((value) => value === 1).length,
    meanMedianMs:
      medians.reduce((sum, value) => sum + value, 0) / medians.length,
    worstP95Ms: Math.max(...p95s),
  };
}

const evidence = {
  benchmarkVersion: 2,
  phase: 'PH-03',
  benchmark: 'multi-scope-admission-stress',
  environment: {
    platform: process.platform,
    arch: process.arch,
    node: process.version,
  },
  candidateLimit: CANDIDATE_LIMIT,
  resultLimit: RESULT_LIMIT,
  strategies: {
    A: 'current kind-filtered recent-200',
    B: 'per-scope exact80 child60 lanes plus recent fallback',
    C: 'single combined exact/child scope reservoir 120 plus recent fallback',
    D: 'single combined exact/child scope reservoir 160 plus recent fallback',
    E: 'adaptive: per-scope for 1 scope, combined-120 for 2-8 scopes',
    F: 'adaptive: per-scope for 1-2 scopes, combined-120 for 4-8 scopes',
  },
  aggregate,
  scenarios,
};

await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
await writeFile(OUTPUT_PATH, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify(evidence, null, 2));
