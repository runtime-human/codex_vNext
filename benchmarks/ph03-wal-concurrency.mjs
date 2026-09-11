import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { DatabaseSync } from 'node:sqlite';
import { isMainThread, parentPort, workerData, Worker } from 'node:worker_threads';

const OUTPUT_PATH = path.resolve(
  'evidence/generated/ph03-wal-concurrency-stress.json',
);
const PROJECT_ID = 'project-benchmark';
const BASE_ROWS = 20_000;
const WRITES = 400;
const READS_PER_WORKER = 1_000;
const READER_WORKERS = 4;
const CHECKPOINTS = [256, 1_000, 4_000];

const SCHEMA = `
CREATE TABLE context_items (
  context_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  scope TEXT NOT NULL,
  summary TEXT NOT NULL,
  source_uri TEXT NOT NULL,
  source_hash TEXT,
  verified_at TEXT NOT NULL,
  stale INTEGER NOT NULL CHECK (stale IN (0, 1)),
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

const READ_SQL = `SELECT context_id, scope, source_uri FROM context_items
  WHERE project_id = ? AND stale = 0 AND kind = ?
  ORDER BY updated_at DESC, context_id ASC LIMIT 12`;

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
    maxMs: Math.max(...values),
  };
}

function configure(db, checkpointPages) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = FULL;
    PRAGMA busy_timeout = 1000;
    PRAGMA wal_autocheckpoint = ${checkpointPages};
  `);
}

function isBusy(error) {
  return String(error?.message ?? error).includes('database is locked');
}

function openConfigured(filePath, checkpointPages) {
  const db = new DatabaseSync(filePath, { timeout: 1_000 });
  configure(db, checkpointPages);
  return db;
}

if (!isMainThread) {
  const { filePath, checkpointPages, role, workerId } = workerData;
  const db = openConfigured(filePath, checkpointPages);
  try {
    if (role === 'reader') {
      const statement = db.prepare(READ_SQL);
      const durations = [];
      let busy = 0;
      for (let index = 0; index < READS_PER_WORKER; index += 1) {
        const started = performance.now();
        try {
          statement.all(PROJECT_ID, 'source_pointer');
        } catch (error) {
          if (!isBusy(error)) throw error;
          busy += 1;
        }
        durations.push(performance.now() - started);
      }
      parentPort.postMessage({ role, workerId, busy, durations });
    } else {
      const insert = db.prepare(`INSERT INTO context_items (
        context_id, project_id, kind, scope, summary, source_uri,
        source_hash, verified_at, stale, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`);
      const durations = [];
      let busy = 0;
      for (let index = 0; index < WRITES; index += 1) {
        const suffix = String(index).padStart(8, '0');
        const timestamp = `writer-${suffix}`;
        const started = performance.now();
        try {
          db.exec('BEGIN IMMEDIATE');
          insert.run(
            `writer-${suffix}`,
            PROJECT_ID,
            'source_pointer',
            `src/writer/${index % 16}`,
            `writer ${suffix}`,
            `repo:src/writer-${suffix}.ts`,
            suffix.padEnd(64, '0'),
            timestamp,
            timestamp,
            timestamp,
          );
          db.exec('COMMIT');
        } catch (error) {
          try {
            db.exec('ROLLBACK');
          } catch {}
          if (!isBusy(error)) throw error;
          busy += 1;
        }
        durations.push(performance.now() - started);
      }
      parentPort.postMessage({ role, workerId, busy, durations });
    }
  } finally {
    db.close();
  }
} else {
  async function fileSize(filePath) {
    try {
      return (await stat(filePath)).size;
    } catch (error) {
      if (error.code === 'ENOENT') return 0;
      throw error;
    }
  }

  function seedDatabase(filePath, checkpointPages) {
    const db = openConfigured(filePath, checkpointPages);
    db.exec(SCHEMA);
    const insert = db.prepare(`INSERT INTO context_items (
      context_id, project_id, kind, scope, summary, source_uri,
      source_hash, verified_at, stale, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    db.exec('BEGIN IMMEDIATE');
    try {
      for (let index = 0; index < BASE_ROWS; index += 1) {
        const suffix = String(index).padStart(8, '0');
        insert.run(
          `context-${suffix}`,
          PROJECT_ID,
          index % 50 === 0 ? 'pitfall' : 'source_pointer',
          `src/${index % 128}`,
          `summary ${suffix}`,
          `repo:src/file-${suffix}.ts`,
          suffix.padEnd(64, '0'),
          suffix,
          index < BASE_ROWS / 2 ? 1 : 0,
          suffix,
          suffix,
        );
      }
      db.exec('COMMIT');
      db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    } finally {
      db.close();
    }
  }

  function runWorker(filePath, checkpointPages, role, workerId) {
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL(import.meta.url), {
        workerData: { filePath, checkpointPages, role, workerId },
      });
      worker.once('message', resolve);
      worker.once('error', reject);
      worker.once('exit', (code) => {
        if (code !== 0) reject(new Error(`worker ${workerId} exited ${code}`));
      });
    });
  }

  async function runScenario(checkpointPages, root) {
    const filePath = path.join(root, `checkpoint-${checkpointPages}.sqlite`);
    seedDatabase(filePath, checkpointPages);
    const started = performance.now();
    const tasks = [runWorker(filePath, checkpointPages, 'writer', 'writer')];
    for (let index = 0; index < READER_WORKERS; index += 1) {
      tasks.push(
        runWorker(filePath, checkpointPages, 'reader', `reader-${index}`),
      );
    }
    const results = await Promise.all(tasks);
    const elapsedMs = performance.now() - started;
    const readers = results.filter((result) => result.role === 'reader');
    const writer = results.find((result) => result.role === 'writer');
    const readerDurations = readers.flatMap((result) => result.durations);
    const walBytesBeforeManual = await fileSize(`${filePath}-wal`);

    const db = openConfigured(filePath, checkpointPages);
    const checkpointStarted = performance.now();
    const checkpoint = db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();
    const checkpointMs = performance.now() - checkpointStarted;
    db.close();

    return {
      checkpointPages,
      elapsedMs,
      reader: {
        operations: readerDurations.length,
        busy: readers.reduce((sum, result) => sum + result.busy, 0),
        timing: summarize(readerDurations),
      },
      writer: {
        operations: writer.durations.length,
        busy: writer.busy,
        timing: summarize(writer.durations),
      },
      walBytesBeforeManual,
      checkpointMs,
      checkpoint,
      walBytesAfterManual: await fileSize(`${filePath}-wal`),
    };
  }

  const root = await mkdtemp(path.join(tmpdir(), 'ph03-wal-stress-'));
  try {
    const scenarios = [];
    for (const checkpointPages of CHECKPOINTS) {
      scenarios.push(await runScenario(checkpointPages, root));
    }
    const evidence = {
      benchmarkVersion: 1,
      phase: 'PH-03',
      benchmark: 'wal-concurrency-stress',
      environment: {
        platform: process.platform,
        arch: process.arch,
        node: process.version,
      },
      workload: {
        baseRows: BASE_ROWS,
        writes: WRITES,
        readerWorkers: READER_WORKERS,
        readsPerWorker: READS_PER_WORKER,
      },
      strategies: {
        A: 'wal_autocheckpoint=256 pages',
        B: 'wal_autocheckpoint=1000 pages (current SQLite default)',
        C: 'wal_autocheckpoint=4000 pages',
      },
      scenarios,
    };
    await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
    await writeFile(OUTPUT_PATH, `${JSON.stringify(evidence, null, 2)}\n`);
    console.log(JSON.stringify(evidence, null, 2));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
