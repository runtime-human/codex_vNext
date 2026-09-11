import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, open, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

const OUTPUT_PATH = path.resolve(
  'evidence/generated/ph03-source-hash-benchmark.json',
);
const SIZES = [
  32 * 1024,
  256 * 1024,
  1024 * 1024,
  4 * 1024 * 1024,
  16 * 1024 * 1024,
];
const ITERATIONS = 12;
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

function metadataIdentity(value) {
  return `${value.dev}:${value.ino}:${value.size}:${value.mtimeNs}`;
}

async function hashStream(stream) {
  const hash = createHash('sha256');
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest('hex');
}

async function strategyA(filePath) {
  const before = await stat(filePath, { bigint: true });
  const digest = await hashStream(createReadStream(filePath));
  return { digest, stable: true, bytes: Number(before.size) };
}

async function strategyB(filePath) {
  const before = await stat(filePath, { bigint: true });
  const digest = await hashStream(createReadStream(filePath));
  const after = await stat(filePath, { bigint: true });
  return {
    digest,
    stable: metadataIdentity(before) === metadataIdentity(after),
    bytes: Number(before.size),
  };
}

async function strategyC(filePath) {
  const handle = await open(filePath, 'r');
  try {
    const before = await handle.stat({ bigint: true });
    const digest = await hashStream(
      handle.createReadStream({ autoClose: false, start: 0 }),
    );
    const after = await handle.stat({ bigint: true });
    return {
      digest,
      stable: metadataIdentity(before) === metadataIdentity(after),
      bytes: Number(before.size),
    };
  } finally {
    await handle.close();
  }
}

async function measure(fn, filePath) {
  for (let index = 0; index < WARMUP_ITERATIONS; index += 1) {
    await fn(filePath);
  }
  const durations = [];
  let last;
  for (let index = 0; index < ITERATIONS; index += 1) {
    const started = performance.now();
    last = await fn(filePath);
    durations.push(performance.now() - started);
  }
  return { ...summarize(durations), last };
}

const root = await mkdtemp(path.join(tmpdir(), 'ph03-source-hash-bench-'));
try {
  const scenarios = [];
  for (const size of SIZES) {
    const filePath = path.join(root, `source-${size}.bin`);
    await writeFile(filePath, Buffer.alloc(size, 0x5a));
    const A = await measure(strategyA, filePath);
    const B = await measure(strategyB, filePath);
    const C = await measure(strategyC, filePath);
    const digests = new Set([A.last.digest, B.last.digest, C.last.digest]);
    if (digests.size !== 1 || !B.last.stable || !C.last.stable) {
      throw new Error(`source hash strategy mismatch for ${size} bytes`);
    }
    scenarios.push({
      bytes: size,
      timingMs: {
        A: { median: A.medianMs, p95: A.p95Ms },
        B: { median: B.medianMs, p95: B.p95Ms },
        C: { median: C.medianMs, p95: C.p95Ms },
      },
      throughputMiBPerSec: {
        A: size / (1024 * 1024) / (A.medianMs / 1000),
        B: size / (1024 * 1024) / (B.medianMs / 1000),
        C: size / (1024 * 1024) / (C.medianMs / 1000),
      },
    });
  }

  const evidence = {
    benchmarkVersion: 1,
    phase: 'PH-03',
    benchmark: 'source-hash-strategy',
    environment: {
      platform: process.platform,
      arch: process.arch,
      node: process.version,
    },
    iterations: ITERATIONS,
    strategies: {
      A: 'path stat + path stream hash without post-read stability check',
      B: 'path stat + path stream hash + path stat stability check',
      C: 'single FileHandle fstat + handle stream hash + fstat stability check',
    },
    scenarios,
  };

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  await rm(root, { recursive: true, force: true });
}
