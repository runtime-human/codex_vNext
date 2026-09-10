import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import { scoreContextCandidate } from '../dist/context/context-index-service.js';

const MAX_CONTEXT_CANDIDATES = 200;
const CONCURRENCY = 4;
const OUTPUT_PATH = path.resolve(
  'evidence/generated/ph03-query-benchmark.json',
);

function compareRanked(left, right) {
  if (left.score !== right.score) return right.score - left.score;
  if (left.item.verifiedAt !== right.item.verifiedAt) {
    return left.item.verifiedAt > right.item.verifiedAt ? -1 : 1;
  }
  return left.item.contextId.localeCompare(right.item.contextId);
}

function makeHit(candidate, freshness, query) {
  return {
    item: candidate,
    freshness,
    score: scoreContextCandidate(candidate, query),
  };
}

function includeFreshness(freshness, options) {
  if (freshness === 'stale') return options.includeStale;
  if (freshness === 'unverifiable') return options.includeUnverifiable;
  return true;
}

async function resolveCandidate(candidate, resolver) {
  if (candidate.stale) return 'stale';
  return resolver(candidate);
}

function finalize(hits, limit, rawCandidateCount) {
  hits.sort(compareRanked);
  return {
    hits: hits.slice(0, limit),
    truncated:
      hits.length > limit || rawCandidateCount >= MAX_CONTEXT_CANDIDATES,
  };
}

async function strategyA(candidates, query, options, resolver) {
  const hits = [];
  for (const candidate of candidates) {
    const freshness = await resolveCandidate(candidate, resolver);
    if (!includeFreshness(freshness, options)) continue;
    hits.push(makeHit(candidate, freshness, query));
  }
  return finalize(hits, options.limit, candidates.length);
}

function rankCandidates(candidates, query) {
  return candidates
    .map((candidate) => makeHit(candidate, 'pending', query))
    .sort(compareRanked)
    .map((hit) => hit.item);
}

function enoughHits(hits, limit, rawCandidateCount) {
  return rawCandidateCount >= MAX_CONTEXT_CANDIDATES
    ? hits.length >= limit
    : hits.length > limit;
}

async function strategyB(candidates, query, options, resolver) {
  const ranked = rankCandidates(candidates, query);
  const hits = [];
  for (const candidate of ranked) {
    const freshness = await resolveCandidate(candidate, resolver);
    if (includeFreshness(freshness, options)) {
      hits.push(makeHit(candidate, freshness, query));
    }
    if (enoughHits(hits, options.limit, candidates.length)) break;
  }
  return finalize(hits, options.limit, candidates.length);
}

async function strategyC(candidates, query, options, resolver) {
  const ranked = rankCandidates(candidates, query);
  const hits = [];
  for (let index = 0; index < ranked.length; index += CONCURRENCY) {
    const batch = ranked.slice(index, index + CONCURRENCY);
    const freshness = await Promise.all(
      batch.map((candidate) => resolveCandidate(candidate, resolver)),
    );
    for (let offset = 0; offset < batch.length; offset += 1) {
      const candidate = batch[offset];
      const state = freshness[offset];
      if (includeFreshness(state, options)) {
        hits.push(makeHit(candidate, state, query));
      }
    }
    if (enoughHits(hits, options.limit, candidates.length)) break;
  }
  return finalize(hits, options.limit, candidates.length);
}

function resultDigest(result) {
  const normalized = {
    truncated: result.truncated,
    hits: result.hits.map((hit) => ({
      contextId: hit.item.contextId,
      freshness: hit.freshness,
      score: hit.score,
    })),
  };
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

function baseCandidates(count, fileBytes) {
  return Array.from({ length: count }, (_, index) => ({
    contextId: `context-${String(index).padStart(3, '0')}`,
    projectId: 'project-benchmark',
    kind: index % 5 === 0 ? 'module_summary' : 'source_pointer',
    scope: index % 2 === 0 ? 'src/context' : 'src/context/sub',
    summary:
      index % 7 === 0
        ? `needle summary ${index}`
        : `ordinary summary ${index}`,
    sourceUri:
      index % 3 === 0
        ? `repo:src/needle-${index}.ts`
        : `repo:src/file-${index}.ts`,
    verifiedAt: new Date(Date.UTC(2026, 8, 10, 18, 0, index % 60)).toISOString(),
    stale: index % 23 === 0,
    runtimeFreshness: 'fresh',
    fileBytes,
  }));
}

function applyFreshnessProfile(candidates, profile, query) {
  const ranked = rankCandidates(candidates, query);
  for (const candidate of ranked) candidate.runtimeFreshness = 'fresh';
  if (profile === 'distributed10') {
    ranked.forEach((candidate, index) => {
      if (index % 10 === 0) candidate.runtimeFreshness = 'stale';
    });
  } else if (profile === 'half') {
    ranked.forEach((candidate, index) => {
      if (index % 2 === 0) candidate.runtimeFreshness = 'stale';
    });
  } else if (profile === 'top20') {
    ranked.slice(0, 20).forEach((candidate) => {
      candidate.runtimeFreshness = 'stale';
    });
  } else if (profile === 'mixed') {
    ranked.forEach((candidate, index) => {
      if (index % 11 === 0) candidate.runtimeFreshness = 'unverifiable';
      else if (index % 5 === 0) candidate.runtimeFreshness = 'stale';
    });
  }
  return candidates;
}

function syntheticResolver(metrics) {
  return async (candidate) => {
    metrics.calls += 1;
    metrics.bytes += candidate.fileBytes;
    return candidate.runtimeFreshness;
  };
}

async function runOne(strategy, candidates, query, options, resolverFactory) {
  const metrics = { calls: 0, bytes: 0 };
  const resolver = resolverFactory(metrics);
  const started = performance.now();
  const result = await strategy(candidates, query, options, resolver);
  return {
    result,
    metrics: {
      ...metrics,
      durationMs: performance.now() - started,
    },
  };
}

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
    median: percentile(values, 0.5),
    p95: percentile(values, 0.95),
  };
}

async function syntheticCampaign() {
  const query = { scopes: ['src/context'], terms: ['needle'] };
  const records = [];
  const counts = [25, 100, 200];
  const limits = [1, 8, 12];
  const profiles = ['fresh', 'distributed10', 'half', 'top20', 'mixed'];
  const sizes = [1024, 32 * 1024, 256 * 1024];

  for (const count of counts) {
    for (const limit of limits) {
      for (const profile of profiles) {
        for (const fileBytes of sizes) {
          const candidates = applyFreshnessProfile(
            baseCandidates(count, fileBytes),
            profile,
            query,
          );
          const options = {
            limit,
            includeStale: false,
            includeUnverifiable: false,
          };
          const runs = {};
          for (const [name, strategy] of [
            ['A', strategyA],
            ['B', strategyB],
            ['C', strategyC],
          ]) {
            runs[name] = await runOne(
              strategy,
              candidates,
              query,
              options,
              syntheticResolver,
            );
          }
          const digestA = resultDigest(runs.A.result);
          const digestB = resultDigest(runs.B.result);
          const digestC = resultDigest(runs.C.result);
          if (digestA !== digestB || digestA !== digestC) {
            throw new Error(
              `correctness mismatch: count=${count} limit=${limit} profile=${profile} bytes=${fileBytes}`,
            );
          }
          records.push({
            count,
            limit,
            profile,
            fileBytes,
            digest: digestA,
            A: runs.A.metrics,
            B: runs.B.metrics,
            C: runs.C.metrics,
          });
        }
      }
    }
  }
  return records;
}

async function realIoCampaign() {
  const root = await mkdtemp(path.join(tmpdir(), 'workflow-next-ph03-bench-'));
  const query = { scopes: ['src/context'], terms: ['needle'] };
  const definitions = [
    { count: 100, limit: 1, profile: 'fresh', fileBytes: 32 * 1024 },
    { count: 200, limit: 8, profile: 'fresh', fileBytes: 32 * 1024 },
    { count: 200, limit: 8, profile: 'top20', fileBytes: 32 * 1024 },
    { count: 200, limit: 12, profile: 'fresh', fileBytes: 256 * 1024 },
  ];
  const output = [];

  try {
    for (const definition of definitions) {
      const scenarioRoot = path.join(
        root,
        `${definition.count}-${definition.limit}-${definition.profile}-${definition.fileBytes}`,
      );
      await mkdir(scenarioRoot, { recursive: true });
      const candidates = applyFreshnessProfile(
        baseCandidates(definition.count, definition.fileBytes),
        definition.profile,
        query,
      );
      for (let index = 0; index < candidates.length; index += 1) {
        const candidate = candidates[index];
        const filePath = path.join(scenarioRoot, `${index}.bin`);
        await writeFile(filePath, Buffer.alloc(definition.fileBytes, index % 251));
        candidate.filePath = filePath;
      }

      const options = {
        limit: definition.limit,
        includeStale: false,
        includeUnverifiable: false,
      };
      const timings = { A: [], B: [], C: [] };
      const work = { A: [], B: [], C: [] };
      let expectedDigest;

      const resolverFactory = (metrics) => async (candidate) => {
        metrics.calls += 1;
        const bytes = await readFile(candidate.filePath);
        metrics.bytes += bytes.length;
        createHash('sha256').update(bytes).digest('hex');
        return candidate.runtimeFreshness;
      };

      for (let iteration = 0; iteration < 5; iteration += 1) {
        for (const [name, strategy] of [
          ['A', strategyA],
          ['B', strategyB],
          ['C', strategyC],
        ]) {
          const run = await runOne(
            strategy,
            candidates,
            query,
            options,
            resolverFactory,
          );
          const digest = resultDigest(run.result);
          expectedDigest ??= digest;
          if (digest !== expectedDigest) {
            throw new Error(`real I/O correctness mismatch in ${name}`);
          }
          timings[name].push(run.metrics.durationMs);
          work[name].push({ calls: run.metrics.calls, bytes: run.metrics.bytes });
        }
      }

      output.push({
        ...definition,
        digest: expectedDigest,
        timingMs: {
          A: summarize(timings.A),
          B: summarize(timings.B),
          C: summarize(timings.C),
        },
        resolverWork: {
          A: work.A[0],
          B: work.B[0],
          C: work.C[0],
        },
      });
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
  return output;
}

function aggregateSynthetic(records) {
  const calls = { A: [], B: [], C: [] };
  const bytes = { A: [], B: [], C: [] };
  for (const record of records) {
    for (const name of ['A', 'B', 'C']) {
      calls[name].push(record[name].calls);
      bytes[name].push(record[name].bytes);
    }
  }
  const sum = (values) => values.reduce((total, value) => total + value, 0);
  return {
    resolverCalls: {
      A: sum(calls.A),
      B: sum(calls.B),
      C: sum(calls.C),
    },
    bytesHashed: {
      A: sum(bytes.A),
      B: sum(bytes.B),
      C: sum(bytes.C),
    },
  };
}

function recommendation(synthetic, realIo) {
  const bCallRatio =
    synthetic.resolverCalls.B / synthetic.resolverCalls.A;
  const cCallRatio =
    synthetic.resolverCalls.C / synthetic.resolverCalls.A;
  const cFasterCount = realIo.filter(
    (scenario) => scenario.timingMs.C.median < scenario.timingMs.B.median * 0.75,
  ).length;
  const cWorkBounded = realIo.every(
    (scenario) =>
      scenario.resolverWork.C.bytes <= scenario.resolverWork.B.bytes * 1.25,
  );

  if (cFasterCount >= 3 && cWorkBounded) {
    return {
      selected: 'C_rank_first_batched_4',
      confidence: 'provisional',
      reason:
        'C preserves exact output, substantially improves representative median latency, and keeps extra resolver work bounded.',
      bCallRatio,
      cCallRatio,
    };
  }
  return {
    selected: 'B_rank_first_lazy_sequential',
    confidence: 'provisional',
    reason:
      'B preserves exact output while minimizing deterministic resolver work; C lacks sufficiently broad replicated latency advantage to justify extra I/O.',
    bCallRatio,
    cCallRatio,
  };
}

const synthetic = await syntheticCampaign();
const realIo = await realIoCampaign();
const aggregate = aggregateSynthetic(synthetic);
const report = {
  benchmark: 'ph03-context-query-strategy',
  generatedAt: new Date().toISOString(),
  node: process.version,
  variants: {
    A: 'current exhaustive sequential freshness reference',
    B: 'rank-first lazy sequential freshness',
    C: 'rank-first freshness in bounded batches of four',
  },
  correctness: {
    syntheticScenarioCount: synthetic.length,
    realIoScenarioCount: realIo.length,
    mismatches: 0,
  },
  syntheticAggregate: aggregate,
  realIo,
  recommendation: recommendation(aggregate, realIo),
};

await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
await writeFile(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
