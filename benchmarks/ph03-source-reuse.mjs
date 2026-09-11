import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import { hashStableRepositoryFile } from '../dist/context/source-resolver.js';

const OUTPUT_PATH = path.resolve(
  'evidence/generated/ph03-source-reuse-stress.json',
);
const MIB = 1024 * 1024;
const OPERATION_BUDGET = 32 * MIB;
const SOURCE_BUDGET = 16 * MIB;
const ITERATIONS = 6;
const CONCURRENCY = 4;

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
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

function workload(files, repeat) {
  const requested = [];
  for (let pass = 0; pass < repeat; pass += 1) {
    requested.push(...files);
  }
  return requested;
}

async function hashOne(filePath, metrics) {
  const result = await hashStableRepositoryFile(
    filePath,
    undefined,
    SOURCE_BUDGET,
  );
  metrics.calls += 1;
  metrics.bytes += result.bytes;
  return result;
}

async function strategyA(requested) {
  const metrics = { calls: 0, bytes: 0, resolved: 0, unverifiable: 0 };
  let remaining = OPERATION_BUDGET;
  for (const filePath of requested) {
    if (remaining < MIB) {
      metrics.unverifiable += 1;
      continue;
    }
    const result = await hashOne(filePath, metrics);
    remaining = Math.max(0, remaining - result.bytes);
    if (result.status === 'resolved') metrics.resolved += 1;
    else metrics.unverifiable += 1;
  }
  return { ...metrics, remainingBytes: remaining };
}

async function strategyB(requested) {
  const metrics = { calls: 0, bytes: 0, resolved: 0, unverifiable: 0 };
  let remaining = OPERATION_BUDGET;
  const memo = new Map();
  for (const filePath of requested) {
    let result = memo.get(filePath);
    if (!result) {
      if (remaining < MIB) {
        result = { status: 'unverifiable', bytes: 0 };
      } else {
        result = await hashOne(filePath, metrics);
        remaining = Math.max(0, remaining - result.bytes);
      }
      memo.set(filePath, result);
    }
    if (result.status === 'resolved') metrics.resolved += 1;
    else metrics.unverifiable += 1;
  }
  return { ...metrics, remainingBytes: remaining, memoEntries: memo.size };
}

async function strategyC(requested) {
  const metrics = { calls: 0, bytes: 0, resolved: 0, unverifiable: 0 };
  let remaining = OPERATION_BUDGET;
  const memo = new Map();

  async function resolve(filePath) {
    const cached = memo.get(filePath);
    if (cached) return await cached;
    if (remaining < MIB) return { status: 'unverifiable', bytes: 0 };
    remaining -= MIB;
    const promise = hashOne(filePath, metrics);
    memo.set(filePath, promise);
    return await promise;
  }

  for (let index = 0; index < requested.length; index += CONCURRENCY) {
    const results = await Promise.all(
      requested.slice(index, index + CONCURRENCY).map(resolve),
    );
    for (const result of results) {
      if (result.status === 'resolved') metrics.resolved += 1;
      else metrics.unverifiable += 1;
    }
  }
  return { ...metrics, remainingBytes: remaining, memoEntries: memo.size };
}

async function measure(strategy, requested) {
  const durations = [];
  let last;
  for (let index = 0; index < ITERATIONS; index += 1) {
    const started = performance.now();
    last = await strategy(requested);
    durations.push(performance.now() - started);
  }
  return { timing: summarize(durations), metrics: last };
}

const root = await mkdtemp(path.join(tmpdir(), 'ph03-source-reuse-'));
try {
  const files = [];
  const payload = Buffer.alloc(MIB, 0x5a);
  for (let index = 0; index < 32; index += 1) {
    const filePath = path.join(
      root,
      `source-${String(index).padStart(2, '0')}.bin`,
    );
    await writeFile(filePath, payload);
    files.push(filePath);
  }

  const workloads = [
    { name: 'unique32', requested: workload(files, 1) },
    { name: 'repeat4x8', requested: workload(files.slice(0, 8), 4) },
    { name: 'repeat16x2', requested: workload(files.slice(0, 2), 16) },
  ];
  const scenarios = [];
  for (const item of workloads) {
    scenarios.push({
      workload: item.name,
      requestedChecks: item.requested.length,
      uniqueSources: new Set(item.requested).size,
      A: await measure(strategyA, item.requested),
      B: await measure(strategyB, item.requested),
      C: await measure(strategyC, item.requested),
    });
  }

  const evidence = {
    benchmarkVersion: 1,
    phase: 'PH-03',
    benchmark: 'request-local-source-reuse-stress',
    environment: {
      platform: process.platform,
      arch: process.arch,
      node: process.version,
    },
    sourceBytes: MIB,
    operationBudgetBytes: OPERATION_BUDGET,
    strategies: {
      A: 'sequential verification without request-local reuse',
      B: 'sequential request-local source snapshot memoization',
      C: 'promise memoization with bounded batches of four and pre-reserved byte budget',
    },
    scenarios,
  };
  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  await rm(root, { recursive: true, force: true });
}
