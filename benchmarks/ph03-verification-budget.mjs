import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import { hashStableRepositoryFile } from '../dist/context/source-resolver.js';

const OUTPUT_PATH = path.resolve(
  'evidence/generated/ph03-verification-budget-benchmark.json',
);
const MIB = 1024 * 1024;
const BUDGETS = [16 * MIB, 32 * MIB, 64 * MIB];
const ITERATIONS = 8;
const WARMUP_ITERATIONS = 2;

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

async function runBudget(workload, budgetBytes) {
  let remainingBytes = budgetBytes;
  let verifiedCount = 0;
  let bytesHashed = 0;
  let budgetExhaustedCount = 0;

  for (const filePath of workload) {
    const metadata = await stat(filePath);
    if (metadata.size > remainingBytes) {
      budgetExhaustedCount += 1;
      continue;
    }
    const result = await hashStableRepositoryFile(filePath);
    if (result.status !== 'resolved') {
      throw new Error(`unexpected stable hash status: ${result.status}`);
    }
    remainingBytes -= result.bytes;
    bytesHashed += result.bytes;
    verifiedCount += 1;
  }

  return {
    verifiedCount,
    bytesHashed,
    budgetExhaustedCount,
    remainingBytes,
  };
}

async function measure(workload, budgetBytes) {
  for (let index = 0; index < WARMUP_ITERATIONS; index += 1) {
    await runBudget(workload, budgetBytes);
  }
  const durations = [];
  let outcome;
  for (let index = 0; index < ITERATIONS; index += 1) {
    const started = performance.now();
    outcome = await runBudget(workload, budgetBytes);
    durations.push(performance.now() - started);
  }
  return { ...summarize(durations), outcome };
}

const root = await mkdtemp(path.join(tmpdir(), 'ph03-budget-bench-'));
try {
  const sizes = [32 * 1024, 256 * 1024, MIB, 4 * MIB, 16 * MIB];
  const files = new Map();
  for (const size of sizes) {
    const filePath = path.join(root, `source-${size}.bin`);
    await writeFile(filePath, Buffer.alloc(size, 0x6b));
    files.set(size, filePath);
  }

  const workloads = {
    tiny200: Array.from({ length: 200 }, () => files.get(32 * 1024)),
    mixed40: Array.from({ length: 40 }, (_, index) =>
      files.get([32 * 1024, 256 * 1024, MIB, 4 * MIB][index % 4]),
    ),
    heavy20: Array.from({ length: 20 }, () => files.get(4 * MIB)),
    jumbo8: Array.from({ length: 8 }, () => files.get(16 * MIB)),
  };

  const scenarios = [];
  for (const [workloadName, workload] of Object.entries(workloads)) {
    for (const budgetBytes of BUDGETS) {
      const result = await measure(workload, budgetBytes);
      scenarios.push({
        workload: workloadName,
        requestedChecks: workload.length,
        budgetBytes,
        timingMs: { median: result.medianMs, p95: result.p95Ms },
        ...result.outcome,
      });
    }
  }

  const evidence = {
    benchmarkVersion: 1,
    phase: 'PH-03',
    benchmark: 'aggregate-source-verification-budget',
    environment: {
      platform: process.platform,
      arch: process.arch,
      node: process.version,
    },
    iterations: ITERATIONS,
    budgets: BUDGETS.map((bytes) => ({ bytes, mebibytes: bytes / MIB })),
    scenarios,
  };

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  await rm(root, { recursive: true, force: true });
}
