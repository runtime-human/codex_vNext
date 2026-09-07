# PH-02 Deterministic State + MCP Substrate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first persistent Workflow Next runtime substrate: a transactional local state store, explicit semantic MCP commands, evidence/artifact metadata, a resource journal, deterministic recovery/status reads, idempotent mutations, and a doctor — without making hooks, private Codex state, Board UI, or subagent orchestration part of correctness.

**Architecture:** PH-02 keeps the single-package Node.js/TypeScript architecture established by PH-01. Operational state lives under the host-provided plugin data root only if the mandatory `TP-02A` live probe proves that the current Codex Desktop/CLI MCP process can persist there. SQLite is accessed through Node's built-in `node:sqlite`; all semantic mutations execute as short `BEGIN IMMEDIATE` transactions that atomically update projections, append an audit event, and persist an idempotency receipt. A stdio MCP server exposes bounded schema-first tools; hooks remain optional telemetry and never own semantic state.

**Tech Stack:** Node.js 24 LTS with a PH-02 minimum of `>=24.12 <25`, TypeScript strict ESM, Zod v4, Vitest, Biome, built-in `node:sqlite`, MCP TypeScript SDK v2 (`@modelcontextprotocol/server`; test client via `@modelcontextprotocol/client`), native Codex local plugin + stdio MCP.

**Spec:** `CODEX_WORKFLOW_NEXT_MASTER_PLAN.md` Rev 4.2, especially `ARC-09..19`, `API-01..05`, `SEC-05..10`, `MILE-02`; `CODEX_WORKFLOW_NEXT_ROADMAP.md` Rev 2.2 `TP-02A` and `PH-02`; PH-01 contracts from `CODEX_WORKFLOW_PH01_IMPLEMENTATION_PLAN.md` Rev 1.2.

## Implementation Amendment 2026-09-08

The initial TP-02A run proved that the legacy `.codex-plugin/plugin.json` plus
`.mcp.json` path loads MCP but does not inject `PLUGIN_DATA`. The required
storage review selected the current supported Agent Plugins v1 package format:
root `plugin.json` plus root `mcp.json`. Two independent Codex CLI 0.153.4 MCP
processes then passed write, SQLite reopen, and restart persistence under the
host-provided `PLUGIN_DATA` root. `ADR-PH02-001` records the decision.

For PH-02, references to the production `.codex-plugin/plugin.json` and
`.mcp.json` are replaced by root Agent Plugins v1 `plugin.json` and `mcp.json`.
Hooks remain `DEGRADED` and Task 12 is skipped because the current Codex loader
does not load hooks for Agent Plugin packages. All other scope and correctness
constraints remain unchanged.

## Global Constraints

- PH-01 must already be `PASS`; otherwise stop before implementation.
- `TP-02A` is a hard storage-design gate, not an optional smoke test.
- Do not silently fall back from `${PLUGIN_DATA}` to `$HOME`, `%APPDATA%`, the repository, `.codex/`, or another arbitrary path.
- Node runtime is `>=24.12 <25`; PH-02 relies on built-in `node:sqlite` options available on this floor.
- Use the built-in `node:sqlite`; do not add `better-sqlite3`, SQLite WASM, an ORM, Prisma, Drizzle, Knex, or another persistence framework in PH-02.
- SQLite uses WAL, `synchronous=FULL`, foreign keys, busy timeout, defensive mode, no extension loading, short transactions, and explicit migration serialization.
- Every state mutation must append its audit event and idempotency receipt in the same transaction as the entity mutation.
- Use `BEGIN IMMEDIATE` for writes; never hold a write transaction across an `await`, network call, child process, or model/tool call.
- Mutation retries are idempotent by a caller-supplied `commandId`; same `commandId` + different normalized request is a conflict.
- Work-item optimistic concurrency uses `expectedVersion`.
- Persist only explicit state, decisions, evidence, reasons, identifiers, hashes and bounded summaries. Never persist hidden chain-of-thought.
- Do not automatically persist raw prompts, raw private source, arbitrary command output or secret-bearing logs.
- Large artifacts live outside SQLite by content hash; SQLite stores metadata/pointers only.
- Hooks are best-effort telemetry only. Hook absence, distrust, error, timeout or write failure must not block correct semantic state.
- Do not add Board UI, `_meta` state transport, sidebar, HTTP/SSE server, custom TUI, worktree orchestration, custom agent spawning, model routing, Context Companion runtime, user TOML policy loading, benchmark infrastructure or Durable Mode in PH-02.
- Do not create `docs/`, `agent_docs/`, Archivist/docs worker, compatibility Markdown or phase-summary Markdown. Gate evidence is machine-readable JSON under `evidence/`.
- Do not use private `~/.codex/sessions` state as product input.
- Public MCP tool annotations must truthfully match behavior.
- Existing PH-01 role/model policy remains unchanged; PH-02 does not resolve or spawn roles.
- No deletion/retention policy for historical runs in PH-02; state cleanup policy belongs a later phase.
- The Main thread owns semantic intent and acceptance. SQLite/MCP owns deterministic state mutation. Workers never rewrite a shared run document.

---

# 1. Phase Boundary and Result

PH-02 is not an orchestration phase.

It builds this substrate:

```text
Main / Skill / future Board intent
              │
              ▼
       schema-first MCP
              │
              ▼
     semantic StateService
              │
      BEGIN IMMEDIATE
              │
      ┌───────┼─────────┐
      ▼       ▼         ▼
 projection  event   command receipt
      │       │         │
      └───────┴─────────┘
              │
            COMMIT
              │
              ▼
       SQLite under
       PLUGIN_DATA
```

And this recovery/read path:

```text
current repository
       │
       ├─ canonical path / sanitized remote
       ├─ current HEAD if Git is available
       ▼
workflow.summary
       │
       ├─ persisted objective
       ├─ active work
       ├─ pending decisions
       ├─ evidence pointers
       ├─ resource cleanup warnings
       ├─ repository drift
       └─ deterministic next-safe-action hint
```

PH-02 explicitly does **not** build:

```text
agent selection
model selection
subagent spawn
worktree creation
parallel scheduling
risk classifier
Board UI
Context Index
benchmark collector
Durable Mode
```

---

# 2. Mandatory Entry Gate: TP-02A

## 2.1 Why this gate is mandatory

PH-00 proved that plugin hooks receive `PLUGIN_DATA` but the tested Windows hook process could not reliably write to it. That result says nothing conclusive about the stdio MCP process.

Current Codex source also has two plugin MCP paths:

- the proven legacy local-plugin path using `.codex-plugin/plugin.json` plus `.mcp.json`;
- the newer Agent Plugin path with explicit `PLUGIN_DATA` handling.

PH-01 is based on the legacy local-plugin path. PH-02 therefore must test the **actual PH-01 packaging path** rather than infer writeability from hook documentation or another manifest format.

## 2.2 Probe fixture

Create:

```text
tests/probes/
├── tp02a-mcp-storage-probe.mjs
└── tp02a-hook-probe.mjs
```

The MCP storage probe exposes one temporary tool:

```text
tp02a.storage_probe
```

with input:

```ts
type ProbeInput =
  | { mode: 'write'; nonce: string }
  | { mode: 'verify'; nonce: string }
  | { mode: 'cleanup'; nonce: string };
```

The `write` mode must:

1. require `process.env.PLUGIN_DATA`;
2. create `${PLUGIN_DATA}/tp02a/`;
3. create a nonce file;
4. append a second line;
5. rename it atomically in the same directory;
6. read it back exactly;
7. create `${PLUGIN_DATA}/tp02a/probe.sqlite3`;
8. create a table and insert the nonce in a transaction;
9. close and reopen SQLite;
10. read the nonce from the reopened database.

The `verify` mode runs after a real MCP process/Desktop restart and must prove both the renamed file and SQLite row survived.

The `cleanup` mode removes only the probe-owned files under `${PLUGIN_DATA}/tp02a/`.

No probe path is allowed to escape the resolved `PLUGIN_DATA` root.

## 2.3 Temporary probe MCP configuration

For the live probe only, create a temporary root `.mcp.json`:

```json
{
  "mcpServers": {
    "workflow-next-tp02a": {
      "type": "stdio",
      "command": "node",
      "args": ["./tests/probes/tp02a-mcp-storage-probe.mjs"],
      "cwd": ".",
      "startup_timeout_sec": 30
    }
  }
}
```

Do not commit this temporary probe configuration. The production `.mcp.json` is created only after the probe passes.

## 2.4 Hook re-probe

The hook probe is secondary and never controls the storage branch.

The Node hook script must:

- read `PLUGIN_ROOT` and `PLUGIN_DATA`;
- attempt to append one nonce line under `${PLUGIN_DATA}/tp02a-hook-probe.log`;
- emit a compact JSON result to stdout;
- exit non-zero on failure.

Use the same trusted plugin-hook shape that is currently supported by Codex and the current platform-specific command field. On Windows, invoke Node through the current supported Windows hook command mechanism; do not revive an obsolete npm-shim workaround.

Record only:

```json
{
  "configured": true,
  "trusted": true,
  "executed": true,
  "pluginDataPresent": true,
  "write": "pass"
}
```

or the corresponding failure fields. Do not preserve raw hook input.

## 2.5 Probe evidence

Commit only:

```text
evidence/ph02-storage-probe.json
tests/probes/tp02a-mcp-storage-probe.mjs
tests/probes/tp02a-hook-probe.mjs
```

Evidence shape:

```json
{
  "probeVersion": 1,
  "date": "YYYY-MM-DD",
  "desktopBuild": "observed-build",
  "cliVersion": "observed-version",
  "nodeVersion": "v24.x.y",
  "pluginFormat": "legacy-codex-plugin",
  "mcp": {
    "pluginDataPresent": true,
    "create": "pass",
    "append": "pass",
    "rename": "pass",
    "read": "pass",
    "sqliteTransaction": "pass",
    "sqliteReopen": "pass",
    "restartPersistence": "pass"
  },
  "hook": {
    "configured": true,
    "trusted": true,
    "executed": false,
    "pluginDataPresent": true,
    "write": "fail",
    "classification": "degraded"
  },
  "storageDecision": "plugin_data_sqlite"
}
```

## 2.6 Hard branch

```text
MCP PLUGIN_DATA probe PASS
        │
        ▼
continue PH-02 with SQLite

MCP PLUGIN_DATA absent/unwritable
        │
        ▼
PH-02 RESULT = BLOCKED
storage ADR required
NO arbitrary fallback
NO SQLite implementation on guessed path
```

Hook failure does **not** block PH-02:

```text
Hook FAIL
→ hooks = degraded
→ continue explicit MCP state
```

---

# 3. Exact PH-02 File Map

The target tree after PH-02 is:

```text
.
├── .codex-plugin/
│   └── plugin.json                     # existing PH-01 manifest
├── .mcp.json                           # PH-02 production stdio MCP
├── skills/
│   ├── orchestrate-work/SKILL.md       # existing PH-01
│   ├── task-envelope/SKILL.md          # existing PH-01
│   ├── verify-work/SKILL.md            # existing PH-01
│   ├── recover-work/SKILL.md           # activate in PH-02
│   └── workflow-status/SKILL.md        # activate in PH-02
├── src/
│   ├── domain/                         # existing PH-01 contracts
│   ├── state/
│   │   ├── errors.ts
│   │   ├── ids.ts
│   │   ├── clock.ts
│   │   ├── canonical-json.ts
│   │   ├── redaction.ts
│   │   ├── storage-root.ts
│   │   ├── sqlite.ts
│   │   ├── transaction.ts
│   │   ├── migration.ts
│   │   ├── migrations/
│   │   │   └── 001-initial.ts
│   │   ├── project-inspector.ts
│   │   ├── repositories.ts
│   │   ├── idempotency.ts
│   │   ├── state-service.ts
│   │   ├── resource-journal.ts
│   │   ├── artifact-store.ts
│   │   ├── reconciliation.ts
│   │   └── index.ts
│   ├── mcp/
│   │   ├── schemas.ts
│   │   ├── result.ts
│   │   ├── tools.ts
│   │   ├── server.ts
│   │   └── index.ts
│   └── doctor/
│       ├── doctor.ts
│       └── index.ts
├── scripts/
│   └── doctor.mjs                      # thin executable wrapper
├── tests/
│   ├── contract/
│   │   ├── ph02-state-contracts.test.ts
│   │   └── ph02-mcp-schemas.test.ts
│   ├── state/
│   │   ├── sqlite.test.ts
│   │   ├── migrations.test.ts
│   │   ├── idempotency.test.ts
│   │   ├── state-service.test.ts
│   │   ├── resource-journal.test.ts
│   │   ├── artifact-store.test.ts
│   │   ├── reconciliation.test.ts
│   │   └── doctor.test.ts
│   ├── mcp/
│   │   ├── tools.test.ts
│   │   └── stdio-smoke.test.ts
│   └── probes/
│       ├── tp02a-mcp-storage-probe.mjs
│       └── tp02a-hook-probe.mjs
├── evidence/
│   ├── ph01-skill-smoke.json           # existing
│   ├── ph02-storage-probe.json
│   └── ph02-state-mcp-smoke.json
├── package.json
├── package-lock.json
├── tsconfig.json
├── tsconfig.build.json
├── vitest.config.ts
├── CODEX_WORKFLOW_NEXT_MASTER_PLAN.md
├── CODEX_WORKFLOW_NEXT_ROADMAP.md
├── CODEX_WORKFLOW_PH01_IMPLEMENTATION_PLAN.md
├── CODEX_WORKFLOW_PH02_IMPLEMENTATION_PLAN.md
└── PROVENANCE.md
```

No `docs/` or `agent_docs/` tree is introduced.

---

# 4. Runtime and Storage Decisions Frozen by PH-02

## 4.1 Node version

Raise the package floor to:

```json
{
  "engines": {
    "node": ">=24.12 <25"
  }
}
```

Reason: PH-02 explicitly uses the built-in `node:sqlite` defensive option and backup/timeout functionality on Node 24 LTS.

Do not silently run on an older Node version.

## 4.2 SQLite library

Use:

```ts
import { DatabaseSync, backup } from 'node:sqlite';
```

Do not add a native SQLite addon.

The module remains a Node release-candidate API at the time this plan is written, so PH-02 must:

- keep all SQLite use behind `src/state/sqlite.ts`;
- test the exact Node 24 floor;
- make a future adapter replacement possible without changing the domain/MCP contracts.

## 4.3 Database location

After TP-02A PASS:

```text
${PLUGIN_DATA}/
├── state/
│   └── workflow-next.sqlite3
├── artifacts/
│   └── sha256/
├── backups/
└── tmp/
```

`resolveStorageRoot()` is the only production function allowed to choose this root.

It has no fallback.

## 4.4 Connection configuration

Every production database connection executes:

```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = FULL;
PRAGMA trusted_schema = OFF;
PRAGMA busy_timeout = 5000;
```

Node connection options:

```ts
new DatabaseSync(dbPath, {
  timeout: 5_000,
  defensive: true,
  allowExtension: false,
});
```

Required runtime assertions:

```text
foreign_keys == 1
journal_mode == "wal"
synchronous == 2
quick_check == "ok"
```

Leave SQLite WAL auto-checkpoint at its default in PH-02. Do not invent custom checkpoint scheduling before evidence shows it is necessary.

## 4.5 Write transaction contract

All writes use:

```ts
withImmediateTransaction(db, () => {
  // synchronous only
});
```

Implementation:

```ts
export function withImmediateTransaction<T>(
  db: DatabaseSync,
  action: () => T,
): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = action();
    if (
      typeof result === 'object'
      && result !== null
      && 'then' in result
      && typeof (result as { then?: unknown }).then === 'function'
    ) {
      throw new Error('write transaction callback must be synchronous');
    }
    db.exec('COMMIT');
    return result;
  } catch (error) {
    if (db.isTransaction) {
      db.exec('ROLLBACK');
    }
    throw error;
  }
}
```

No async work is allowed inside this callback.

## 4.6 ID generation

PH-02 generates IDs server-side:

```ts
import { randomUUID } from 'node:crypto';

export const newRunId = () => `run_${randomUUID()}`;
export const newWorkItemId = () => `work_${randomUUID()}`;
export const newDecisionId = () => `decision_${randomUUID()}`;
export const newEvidenceId = () => `evidence_${randomUUID()}`;
export const newResourceId = () => `resource_${randomUUID()}`;
export const newEventId = () => `event_${randomUUID()}`;
export const newArtifactId = () => `artifact_${randomUUID()}`;
```

Caller-generated `TaskId` remains separate.

## 4.7 Time

Use an injectable UTC clock:

```ts
export interface Clock {
  nowIso(): string;
}

export const systemClock: Clock = {
  nowIso: () => new Date().toISOString(),
};
```

Database code never calls `new Date()` directly outside this adapter.

---

# 5. Initial SQLite Schema

Migration `001-initial` creates the following tables as `STRICT`.

## 5.1 `schema_migrations`

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  checksum TEXT NOT NULL,
  applied_at TEXT NOT NULL
) STRICT;
```

## 5.2 `projects`

```sql
CREATE TABLE projects (
  project_id TEXT PRIMARY KEY,
  repo_root TEXT NOT NULL,
  repo_key TEXT NOT NULL UNIQUE,
  repo_fingerprint TEXT NOT NULL,
  remote_url TEXT,
  default_branch TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 1)
) STRICT;
```

`repo_key` is SHA-256 of the canonical local project root.

`repo_fingerprint` is SHA-256 of a canonical JSON object containing:

```json
{
  "repoRoot": "canonical-root",
  "sanitizedRemoteUrl": "optional"
}
```

HEAD is **not** part of project identity.

## 5.3 `runs`

```sql
CREATE TABLE runs (
  run_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  objective TEXT NOT NULL,
  state TEXT NOT NULL CHECK (
    state IN ('active', 'paused', 'blocked', 'completed', 'cancelled')
  ),
  durable INTEGER NOT NULL CHECK (durable IN (0, 1)),
  primary_thread_id TEXT,
  repo_head_at_start TEXT,
  last_observed_repo_head TEXT,
  started_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 1)
) STRICT;
```

PH-02 accepts only `durable = 0`. Durable Mode remains PH-08.

## 5.4 `work_items`

```sql
CREATE TABLE work_items (
  work_item_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(run_id),
  title TEXT NOT NULL,
  objective TEXT NOT NULL,
  state TEXT NOT NULL CHECK (
    state IN (
      'ready',
      'running',
      'verifying',
      'needs_decision',
      'needs_review',
      'blocked',
      'done',
      'cancelled'
    )
  ),
  risk TEXT NOT NULL CHECK (
    risk IN ('low', 'medium', 'high', 'critical')
  ),
  owner_role TEXT CHECK (
    owner_role IS NULL OR owner_role IN (
      'context_companion',
      'investigator',
      'executor',
      'senior_executor',
      'verifier'
    )
  ),
  native_thread_id TEXT,
  worktree_ref TEXT,
  acceptance_json TEXT NOT NULL,
  readiness_level TEXT NOT NULL CHECK (
    readiness_level IN (
      'implemented',
      'validated_local',
      'validated_target',
      'released',
      'accepted'
    )
  ),
  readiness_evidence_json TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
```

State may only change through the transition service. `work.update` cannot patch `state`.

## 5.5 `decisions`

```sql
CREATE TABLE decisions (
  decision_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(run_id),
  work_item_id TEXT REFERENCES work_items(work_item_id),
  question TEXT NOT NULL,
  alternatives_json TEXT,
  recommendation TEXT,
  status TEXT NOT NULL CHECK (
    status IN ('pending', 'resolved', 'superseded')
  ),
  authority TEXT NOT NULL CHECK (
    authority IN ('main', 'user')
  ),
  resolution TEXT,
  version INTEGER NOT NULL CHECK (version >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
```

## 5.6 `evidence`

```sql
CREATE TABLE evidence (
  evidence_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(run_id),
  work_item_id TEXT REFERENCES work_items(work_item_id),
  kind TEXT NOT NULL CHECK (
    kind IN (
      'test',
      'build',
      'lint',
      'review',
      'git',
      'artifact',
      'source',
      'manual',
      'target_observation'
    )
  ),
  summary TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN ('pass', 'fail', 'partial', 'unknown')
  ),
  source_uri TEXT,
  command TEXT,
  exit_code INTEGER,
  git_sha TEXT,
  artifact_id TEXT,
  created_at TEXT NOT NULL
) STRICT;
```

A later migration may add the foreign key from `artifact_id` after artifact ordering requirements are finalized. PH-02 repository code validates referenced artifact IDs deterministically before insert.

## 5.7 `artifacts`

```sql
CREATE TABLE artifacts (
  artifact_id TEXT PRIMARY KEY,
  sha256 TEXT NOT NULL UNIQUE,
  byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
  media_type TEXT NOT NULL,
  relative_path TEXT NOT NULL UNIQUE,
  preview TEXT,
  created_at TEXT NOT NULL
) STRICT;
```

`relative_path` is always relative to the validated plugin data root.

## 5.8 `resources`

```sql
CREATE TABLE resources (
  resource_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(run_id),
  work_item_id TEXT REFERENCES work_items(work_item_id),
  type TEXT NOT NULL CHECK (
    type IN (
      'agent_thread',
      'worktree',
      'temporary_branch',
      'tool_session',
      'test_run',
      'other'
    )
  ),
  control TEXT NOT NULL CHECK (
    control IN ('coordinated', 'observed')
  ),
  owner TEXT NOT NULL,
  native_ref TEXT,
  status TEXT NOT NULL CHECK (
    status IN (
      'intent_recorded',
      'observed',
      'attached',
      'running',
      'completed',
      'failed',
      'cleaned'
    )
  ),
  cleanup_required INTEGER NOT NULL CHECK (
    cleanup_required IN (0, 1)
  ),
  last_error TEXT,
  evidence_id TEXT REFERENCES evidence(evidence_id),
  version INTEGER NOT NULL CHECK (version >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
```

Rules:

- `control='coordinated'` may start at `intent_recorded`;
- `control='observed'` starts at `observed`;
- `observed` resources cannot set `cleanup_required=1`;
- `native_ref` is required before `attached` or `running`;
- `cleaned` forces `cleanup_required=0`.

## 5.9 `workflow_events`

```sql
CREATE TABLE workflow_events (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  run_id TEXT NOT NULL REFERENCES runs(run_id),
  entity_type TEXT NOT NULL CHECK (
    entity_type IN (
      'run',
      'work_item',
      'decision',
      'evidence',
      'resource',
      'artifact'
    )
  ),
  entity_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  command_id TEXT,
  created_at TEXT NOT NULL
) STRICT;
```

Event payloads are curated state deltas, not copied tool arguments.

## 5.10 `command_receipts`

```sql
CREATE TABLE command_receipts (
  command_id TEXT PRIMARY KEY,
  tool_name TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  run_id TEXT REFERENCES runs(run_id),
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;
```

Same `command_id` with a different `request_hash` is `IDEMPOTENCY_CONFLICT`.

## 5.11 Indexes

```sql
CREATE INDEX idx_runs_project_updated
  ON runs(project_id, updated_at DESC);

CREATE INDEX idx_work_items_run_state
  ON work_items(run_id, state);

CREATE INDEX idx_decisions_run_status
  ON decisions(run_id, status);

CREATE INDEX idx_decisions_work_status
  ON decisions(work_item_id, status);

CREATE INDEX idx_evidence_work
  ON evidence(work_item_id, created_at);

CREATE INDEX idx_resources_run_cleanup
  ON resources(run_id, cleanup_required, status);

CREATE INDEX idx_events_run_sequence
  ON workflow_events(run_id, sequence);
```

Set:

```sql
PRAGMA user_version = 1;
```

after migration 001 is successfully recorded.

---

# 6. Canonical JSON and Idempotency

Implement deterministic JSON serialization for JSON-compatible data:

```ts
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
    .join(',')}}`;
}
```

Request hash:

```ts
sha256(canonicalJson({
  toolName,
  inputWithoutCommandId
}))
```

The idempotency executor:

```ts
executeIdempotent({
  db,
  toolName,
  commandId,
  runId,
  normalizedInput,
  mutate,
});
```

must:

1. compute request hash;
2. look for `command_receipts.command_id`;
3. if receipt exists with same tool/hash, return stored result without reapplying;
4. if receipt exists with different tool/hash, throw `IDEMPOTENCY_CONFLICT`;
5. otherwise perform mutation;
6. append event(s);
7. insert receipt;
8. commit everything atomically.

Do not use wall-clock timestamps in request hashes.

---

# 7. State Error Contract

Create deterministic error codes:

```ts
export type StateErrorCode =
  | 'INVALID_ARGUMENT'
  | 'NOT_FOUND'
  | 'VERSION_CONFLICT'
  | 'IDEMPOTENCY_CONFLICT'
  | 'INVALID_TRANSITION'
  | 'COMPLETION_BLOCKED'
  | 'STORAGE_UNAVAILABLE'
  | 'MIGRATION_CONFLICT'
  | 'INTEGRITY_FAILED'
  | 'PATH_OUTSIDE_ROOT'
  | 'INTERNAL';
```

`StateError`:

```ts
export class StateError extends Error {
  constructor(
    readonly code: StateErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'StateError';
  }
}
```

MCP responses never expose raw stack traces.

---

# 8. Evidence and Secret Handling

`evidence.record` accepts bounded structured evidence only.

Before persistence, run deterministic redaction on:

- `summary`;
- `command`;
- string-valued error details stored in events/resources.

At minimum redact common forms:

```text
Authorization: Bearer <value>
Bearer <value>
token=<value>
api_key=<value>
apikey=<value>
password=<value>
secret=<value>
github_pat_<value>
ghp_<value>
sk-<value>
```

Redaction output is:

```text
[REDACTED]
```

Do not attempt to preserve the secret hash.

PH-02 does not auto-ingest raw stdout/stderr.

---

# 9. Artifact Store Contract

Artifacts are internal substrate in PH-02; no public `artifact.put` MCP tool ships yet.

API:

```ts
interface ArtifactMetadata {
  artifactId: string;
  sha256: string;
  byteSize: number;
  mediaType: string;
  relativePath: string;
  preview?: string;
  createdAt: string;
}

interface ArtifactStore {
  putBytes(input: {
    bytes: Uint8Array;
    mediaType: string;
    preview?: string;
  }): ArtifactMetadata;

  get(artifactId: string): ArtifactMetadata | undefined;
  resolvePath(artifactId: string): string;
}
```

Layout:

```text
artifacts/sha256/<first-two-hex>/<full-sha256>
```

Write path:

```text
bytes
→ sha256
→ temp file inside PLUGIN_DATA/tmp
→ fsync/close
→ atomic rename into CAS path
→ insert metadata if absent
```

If the CAS file already exists with the same hash, reuse it.

A DB failure may leave an unreferenced CAS object; that is safe. Doctor reports it as an orphan. PH-02 doctor does not delete it automatically.

Default artifact size ceiling: 10 MiB per explicit `putBytes()` call. Larger payloads are rejected in PH-02.

---

# 10. Resource Journal Contract

`ResourceJournal` is not a scheduler.

Internal API:

```ts
interface ResourceIntentInput {
  runId: string;
  workItemId?: string;
  type:
    | 'agent_thread'
    | 'worktree'
    | 'temporary_branch'
    | 'tool_session'
    | 'test_run'
    | 'other';
  owner: string;
  cleanupRequired: boolean;
}

interface ResourceAttachInput {
  resourceId: string;
  expectedVersion: number;
  nativeRef: string;
}

interface ResourceTransitionInput {
  resourceId: string;
  expectedVersion: number;
  to: 'running' | 'completed' | 'failed' | 'cleaned';
  error?: string;
  evidenceId?: string;
}
```

Lifecycle:

```text
coordinated:
intent_recorded
→ attached | failed
→ running | completed | failed
→ cleaned

observed:
observed
→ running | completed | failed
```

Observed resources cannot claim cleanup ownership.

`resource.record` MCP is a discriminated command wrapper around these operations and is primarily a substrate for PH-04/PH-08.

---

# 11. Repository Reconciliation Contract

`ProjectInspector` performs bounded read-only repository inspection with `execFile`, never a shell string.

Allowed Git calls:

```text
git rev-parse --show-toplevel
git rev-parse HEAD
git remote get-url origin
git symbolic-ref --short refs/remotes/origin/HEAD
```

Each call:

- timeout: 3 seconds;
- no stdin;
- bounded stdout;
- stderr discarded from persisted state;
- failure returns `undefined`, not a fatal error unless the project root itself is invalid.

Sanitize remote URLs before storage:

- remove HTTP(S) username/password/userinfo;
- remove query and fragment;
- preserve host/repository path;
- SSH `user@host:path` may preserve the non-secret username.

`workflow.summary` compares:

```text
persisted project fingerprint
current project fingerprint

run.last_observed_repo_head
current HEAD
```

and reports:

```ts
type RepoDrift =
  | 'none'
  | 'head_changed'
  | 'project_identity_changed'
  | 'git_unavailable';
```

Never mark a persisted `running` resource as currently alive unless a supported native observation confirms it. PH-02 therefore reports native liveness as `unknown` after restart.

---

# 12. PH-02 MCP Tool Surface

PH-02 ships only these tools:

```text
workflow.summary        read-only
workflow.begin          mutating
work.get                read-only
work.update             mutating create/patch
work.transition         mutating
decision.request        mutating
decision.resolve        mutating
evidence.record         mutating
resource.record         mutating
```

No Board/render tool yet.

No context tools yet.

No metrics tools yet.

## 12.1 Common mutation metadata

```ts
export const MutationMetaSchema = z.object({
  commandId: z.string().min(1).max(160),
}).strict();
```

`commandId` is an idempotency key, not `TaskId`.

A caller may derive it from a stable TaskId and action name, for example:

```text
task_17:work-transition:verifying
```

## 12.2 `workflow.summary`

Input:

```ts
export const WorkflowSummaryInputSchema = z.object({
  projectRoot: z.string().min(1).optional(),
  runId: z.string().min(1).optional(),
}).strict().superRefine((value, ctx) => {
  if (!value.projectRoot && !value.runId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'projectRoot or runId is required',
    });
  }
});
```

Output:

```ts
export const WorkflowSummaryOutputSchema = z.object({
  project: z.object({
    projectId: z.string(),
    repoRoot: z.string(),
    repoFingerprint: z.string(),
    currentHead: z.string().optional(),
    repoDrift: z.enum([
      'none',
      'head_changed',
      'project_identity_changed',
      'git_unavailable',
    ]),
  }).optional(),
  run: z.object({
    runId: z.string(),
    objective: z.string(),
    state: z.enum(['active', 'paused', 'blocked', 'completed', 'cancelled']),
    startedAt: z.string(),
    updatedAt: z.string(),
  }).optional(),
  activeWork: z.array(z.object({
    workItemId: z.string(),
    title: z.string(),
    state: z.string(),
    risk: z.string(),
    version: z.number().int(),
    liveness: z.literal('unknown'),
  })),
  pendingDecisions: z.array(z.object({
    decisionId: z.string(),
    workItemId: z.string().optional(),
    question: z.string(),
    authority: z.enum(['main', 'user']),
  })),
  evidenceRefs: z.array(z.object({
    evidenceId: z.string(),
    workItemId: z.string().optional(),
    kind: z.string(),
    status: z.string(),
    summary: z.string(),
  })),
  cleanupRequiredResources: z.array(z.object({
    resourceId: z.string(),
    type: z.string(),
    nativeRef: z.string().optional(),
    status: z.string(),
  })),
  nextSafeAction: z.enum([
    'start_run',
    'resolve_decision',
    'inspect_repo_drift',
    'reconcile_active_work',
    'inspect_cleanup',
    'resume_work',
    'verify_work',
    'none',
  ]),
}).strict();
```

The `nextSafeAction` is deterministic state projection, not hidden reasoning.

## 12.3 `workflow.begin`

Input:

```ts
z.object({
  commandId: z.string().min(1),
  projectRoot: z.string().min(1),
  objective: z.string().min(1),
  primaryThreadId: z.string().min(1).optional(),
  durable: z.literal(false).default(false),
}).strict()
```

Behavior:

- inspect/canonicalize project;
- ensure project row;
- generate one new run;
- capture current HEAD if available;
- append `run.started`;
- persist idempotency receipt.

Duplicate same `commandId` returns the same `runId`.

## 12.4 `work.get`

Input:

```ts
z.object({
  workItemId: z.string().min(1),
}).strict()
```

Output includes:

- WorkItem fields;
- acceptance spec;
- readiness level;
- pass evidence refs;
- pending decisions;
- version.

## 12.5 `work.update`

Discriminated input:

```ts
z.discriminatedUnion('operation', [
  z.object({
    operation: z.literal('create'),
    commandId: z.string().min(1),
    runId: z.string().min(1),
    title: z.string().min(1),
    objective: z.string().min(1),
    risk: z.enum(['low', 'medium', 'high', 'critical']),
    ownerRole: AgentRoleSchema.optional(),
    acceptance: AcceptanceSpecSchema,
  }).strict(),

  z.object({
    operation: z.literal('patch'),
    commandId: z.string().min(1),
    workItemId: z.string().min(1),
    expectedVersion: z.number().int().min(1),
    patch: z.object({
      title: z.string().min(1).optional(),
      objective: z.string().min(1).optional(),
      risk: z.enum(['low', 'medium', 'high', 'critical']).optional(),
      ownerRole: AgentRoleSchema.nullable().optional(),
      nativeThreadId: z.string().min(1).nullable().optional(),
      worktreeRef: z.string().min(1).nullable().optional(),
      acceptance: AcceptanceSpecSchema.optional(),
    }).strict(),
  }).strict(),
]);
```

`patch` cannot contain `state`, `version`, or readiness.

## 12.6 `work.transition`

Use a discriminated completion branch:

```ts
z.discriminatedUnion('to', [
  z.object({
    commandId: z.string().min(1),
    workItemId: z.string().min(1),
    expectedVersion: z.number().int().min(1),
    to: z.enum([
      'ready',
      'running',
      'verifying',
      'needs_decision',
      'needs_review',
      'blocked',
      'cancelled',
    ]),
    note: z.string().min(1).optional(),
  }).strict(),

  z.object({
    commandId: z.string().min(1),
    workItemId: z.string().min(1),
    expectedVersion: z.number().int().min(1),
    to: z.literal('done'),
    completion: z.object({
      achievedLevel: ReadinessLevelSchema,
      evidenceIds: z.array(EvidenceIdSchema).min(1),
    }).strict(),
  }).strict(),
]);
```

For `to='done'`:

1. load acceptance;
2. load only referenced evidence;
3. require referenced evidence exists;
4. only `status='pass'` counts toward completion;
5. load pending work-level and run-level decisions;
6. call PH-01 `validateCompletion`;
7. if blocked, return `COMPLETION_BLOCKED`;
8. otherwise transition + update readiness + event + receipt atomically.

No worker/idle signal can bypass this path.

## 12.7 `decision.request`

Input:

```ts
z.object({
  commandId: z.string().min(1),
  runId: z.string().min(1),
  workItemId: z.string().min(1).optional(),
  question: z.string().min(1),
  alternatives: z.array(z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    consequence: z.string().min(1).optional(),
  }).strict()).optional(),
  recommendation: z.string().min(1).optional(),
  authority: z.enum(['main', 'user']),
}).strict()
```

Creates only `pending`.

## 12.8 `decision.resolve`

Input:

```ts
z.object({
  commandId: z.string().min(1),
  decisionId: z.string().min(1),
  expectedVersion: z.number().int().min(1),
  resolution: z.string().min(1),
}).strict()
```

PH-02 records semantic resolution. Strong user-authority enforcement remains PH-05/PH-07 because current MCP does not cryptographically prove that a text resolution came directly from the user.

## 12.9 `evidence.record`

Input:

```ts
z.object({
  commandId: z.string().min(1),
  runId: z.string().min(1),
  workItemId: z.string().min(1).optional(),
  kind: EvidenceKindSchema,
  summary: z.string().min(1),
  status: z.enum(['pass', 'fail', 'partial', 'unknown']),
  sourceUri: z.string().min(1).optional(),
  command: z.string().min(1).optional(),
  exitCode: z.number().int().optional(),
  gitSha: z.string().min(1).optional(),
  artifactId: z.string().min(1).optional(),
}).strict()
```

The server generates `evidenceId` and `createdAt`.

## 12.10 `resource.record`

Input is:

```ts
z.discriminatedUnion('operation', [
  z.object({
    operation: z.literal('intent'),
    commandId: z.string().min(1),
    runId: z.string().min(1),
    workItemId: z.string().min(1).optional(),
    type: ResourceTypeSchema,
    owner: z.string().min(1),
    cleanupRequired: z.boolean(),
  }).strict(),

  z.object({
    operation: z.literal('observe'),
    commandId: z.string().min(1),
    runId: z.string().min(1),
    workItemId: z.string().min(1).optional(),
    type: ResourceTypeSchema,
    owner: z.string().min(1),
    nativeRef: z.string().min(1),
  }).strict(),

  z.object({
    operation: z.literal('attach'),
    commandId: z.string().min(1),
    resourceId: z.string().min(1),
    expectedVersion: z.number().int().min(1),
    nativeRef: z.string().min(1),
  }).strict(),

  z.object({
    operation: z.literal('transition'),
    commandId: z.string().min(1),
    resourceId: z.string().min(1),
    expectedVersion: z.number().int().min(1),
    to: z.enum(['running', 'completed', 'failed', 'cleaned']),
    error: z.string().min(1).optional(),
    evidenceId: z.string().min(1).optional(),
  }).strict(),
]);
```

---

# 13. MCP Tool Annotations

Use truthful annotations:

| Tool | readOnly | destructive | idempotent | openWorld |
|---|---:|---:|---:|---:|
| `workflow.summary` | true | false | true | false |
| `workflow.begin` | false | false | true | false |
| `work.get` | true | false | true | false |
| `work.update` | false | false | true | false |
| `work.transition` | false | true | true | false |
| `decision.request` | false | false | true | false |
| `decision.resolve` | false | true | true | false |
| `evidence.record` | false | false | true | false |
| `resource.record` | false | true | true | false |

`destructive=true` is intentionally conservative for transitions/resolutions/resource lifecycle operations because they change existing operational truth or cleanup state.

Every tool has:

- explicit Zod input schema;
- explicit Zod output schema;
- bounded `structuredContent`;
- one concise text block;
- no raw database row dump;
- no stack trace.

---

# 14. MCP Server Entry Point

Use MCP TypeScript SDK v2.

Server factory:

```ts
export function buildWorkflowNextMcpServer(deps: RuntimeDeps): McpServer {
  const server = new McpServer({
    name: 'workflow-next',
    version: packageVersion,
  });

  registerWorkflowTools(server, deps);

  return server;
}
```

stdio entry:

```ts
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { buildRuntimeFromEnvironment } from '../state/index.js';
import { buildWorkflowNextMcpServer } from './server.js';

await serveStdio(() => {
  const runtime = buildRuntimeFromEnvironment();
  return buildWorkflowNextMcpServer(runtime);
});
```

Use `serveStdio()` rather than direct `new StdioServerTransport()` so the current MCP SDK can negotiate the current 2026 protocol revision while retaining its documented legacy behavior.

Production `.mcp.json`:

```json
{
  "mcpServers": {
    "workflow-next": {
      "type": "stdio",
      "command": "node",
      "args": ["./dist/mcp/index.js"],
      "cwd": ".",
      "startup_timeout_sec": 30
    }
  }
}
```

The server itself requires `PLUGIN_DATA`.

No HTTP endpoint is added.

---

# 15. `workflow-status` Skill Contract

Create `skills/workflow-status/SKILL.md`.

Purpose:

- answer "what is Workflow Next doing/what state is saved?";
- call only read-only state tools;
- never invent live agent status;
- label persisted/liveness-unknown state accurately.

Required procedure:

```text
1. Determine current canonical project root.
2. Call workflow.summary with projectRoot.
3. If no run exists, say no active persisted workflow exists.
4. Show:
   - objective/run state,
   - active work,
   - pending decisions,
   - cleanup-required resources,
   - repo drift,
   - evidence completeness summary.
5. Treat liveness=unknown as unknown.
6. Do not transition or repair anything.
```

Keep under 100 non-empty lines.

---

# 16. `recover-work` Skill Contract

Create `skills/recover-work/SKILL.md`.

Purpose:

- reconstruct a safe continuation point from durable operational state;
- avoid transcript replay;
- never turn persisted `running` into a claim that a native worker is still running.

Required procedure:

```text
1. Determine canonical project root.
2. Call workflow.summary.
3. If repo drift is head_changed/project_identity_changed:
   stop and inspect current repo state before resuming.
4. If pending user decision exists:
   surface it before implementation.
5. If cleanup-required resource exists:
   surface cleanup risk before creating replacements.
6. For persisted running/verifying work:
   treat native liveness as unknown and reconcile evidence/repo first.
7. Return:
   objective,
   active work,
   decisions,
   evidence pointers,
   repo fingerprint/drift,
   next safe action.
8. Do not reconstruct hidden reasoning or replay old transcript.
```

Keep under 120 non-empty lines.

---

# 17. Doctor Contract

CLI:

```powershell
npm run doctor -- --json
```

`doctor` is read-only in PH-02.

Checks:

```text
PLUGIN_DATA present
storage directories writable
database opens
journal_mode = wal
synchronous = full
foreign_keys = on
schema_migrations checksum valid
PRAGMA user_version matches latest migration
PRAGMA quick_check = ok
PRAGMA foreign_key_check returns no rows
artifact metadata target exists
CAS files without metadata are warnings
cleanup_required resources are warnings
legacy active resources have liveness unknown
```

Output:

```ts
interface DoctorReport {
  status: 'pass' | 'warn' | 'fail';
  checks: Array<{
    name: string;
    status: 'pass' | 'warn' | 'fail';
    message: string;
  }>;
}
```

No `--repair` in PH-02.

---

# 18. Migration Safety

Migration interface:

```ts
export interface Migration {
  version: number;
  name: string;
  kind: 'compatible' | 'incompatible';
  sql: string;
}
```

Rules:

1. bootstrap `schema_migrations`;
2. hash migration SQL;
3. reject checksum drift for applied version;
4. serialize apply through `BEGIN IMMEDIATE`;
5. re-read applied versions after acquiring the write lock;
6. if pending migration is `incompatible`, create SQLite backup first;
7. after migration:
   - record migration row;
   - set `PRAGMA user_version`;
   - commit;
   - run `PRAGMA quick_check`;
8. failure leaves previous schema state intact.

The first migration is `compatible`.

Unit tests include a test-only incompatible migration to prove backup-before-apply behavior.

---

# 19. Task-by-Task Implementation

## Task 0: Execute TP-02A and freeze storage branch

**Files:**
- Create: `tests/probes/tp02a-mcp-storage-probe.mjs`
- Create: `tests/probes/tp02a-hook-probe.mjs`
- Create: `evidence/ph02-storage-probe.json`
- Temporary only: `.mcp.json`
- Temporary only: `hooks/hooks.json`

**Interfaces:**
- Produces the only evidence allowed to select SQLite-under-PLUGIN_DATA.
- No production state code starts before this task passes.

- [x] **Step 1: Write the MCP storage probe**

Implement the three `write|verify|cleanup` modes exactly as section 2.

Use built-in Node modules only:

```js
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
```

The probe must fail with a structured result if `PLUGIN_DATA` is absent.

- [x] **Step 2: Create temporary `.mcp.json` and reload the plugin**

Use the exact temporary configuration from section 2.3.

- [x] **Step 3: Invoke `write` with a random nonce**

Expected:

```text
PLUGIN_DATA present
file create PASS
append PASS
rename PASS
read PASS
SQLite transaction PASS
SQLite reopen PASS
```

- [x] **Step 4: Restart the actual MCP host/session**

Close/restart enough of Desktop/CLI that a new stdio MCP process starts.

Invoke `verify` with the same nonce.

Expected:

```text
restartPersistence = PASS
```

- [x] **Step 5: Invoke cleanup**

Expected: only the probe-owned `${PLUGIN_DATA}/tp02a` content is removed.

- [x] **Step 6: Re-probe one minimal trusted plugin hook**

Attempt the same `PLUGIN_DATA` marker write.

Classify:

```text
PASS | DEGRADED
```

Do not classify PH-02 storage from the hook result.

- [x] **Step 7: Write `evidence/ph02-storage-probe.json`**

Do not include absolute user paths, raw hook payloads or secrets.

- [x] **Step 8: Apply the branch**

If MCP restart persistence failed:

```text
PH-02 RESULT = BLOCKED
```

Stop the implementation.

If passed, continue.

- [x] **Step 9: Remove temporary hook/MCP configuration**

The production `.mcp.json` comes later.

- [x] **Step 10: Commit probe evidence**

```powershell
git add tests/probes evidence/ph02-storage-probe.json
git commit -m "test: prove PH-02 plugin storage capability"
```

---

## Task 1: Add PH-02 runtime dependencies and version floor

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `tsconfig.json` only if current MCP v2 typings require an explicit compatible Node type setup.
- Test: `tests/contract/ph02-state-contracts.test.ts`

**Interfaces:**
- Produces the runtime dependency floor used by all later PH-02 tasks.

- [ ] **Step 1: Write a failing environment contract test**

Test:

```ts
expect(process.versions.node major/minor).to satisfy >=24.12 <25
```

and:

```ts
await import('node:sqlite')
```

- [ ] **Step 2: Run RED on an intentionally unsupported version fixture**

The test helper must be pure and test the version parser without requiring the real process to be unsupported.

- [ ] **Step 3: Raise Node engine floor**

```powershell
npm pkg set engines.node=">=24.12 <25"
```

- [ ] **Step 4: Add MCP v2 dependencies**

```powershell
npm install --save-exact @modelcontextprotocol/server
npm install --save-dev --save-exact @modelcontextprotocol/client
```

Do not install v1 `@modelcontextprotocol/sdk`.

- [ ] **Step 5: Run dependency/type checks**

```powershell
npm run typecheck
npm test -- ph02-state-contracts
```

- [ ] **Step 6: Commit**

```powershell
git add package.json package-lock.json tsconfig.json tests/contract/ph02-state-contracts.test.ts
git commit -m "build: add PH-02 state and MCP runtime dependencies"
```

---

## Task 2: Implement storage root, SQLite adapter and transaction primitive

**Files:**
- Create: `src/state/errors.ts`
- Create: `src/state/clock.ts`
- Create: `src/state/ids.ts`
- Create: `src/state/storage-root.ts`
- Create: `src/state/sqlite.ts`
- Create: `src/state/transaction.ts`
- Create: `src/state/index.ts`
- Test: `tests/state/sqlite.test.ts`

**Interfaces:**
- Produces `resolveStorageRoot`, `openWorkflowDatabase`, `withImmediateTransaction`, ID generators and clock injection.
- Later repository/service code must not open SQLite directly.

- [ ] **Step 1: Write failing storage-root tests**

Required cases:

```text
missing PLUGIN_DATA → STORAGE_UNAVAILABLE
file instead of directory → STORAGE_UNAVAILABLE
valid temp directory → resolves
state/artifacts/backups/tmp directories stay inside root
```

- [ ] **Step 2: Write failing SQLite pragma tests**

Against a temp directory, assert:

```text
foreign_keys = 1
journal_mode = wal
synchronous = 2
quick_check = ok
extensions cannot be enabled
```

- [ ] **Step 3: Write a transaction rollback test**

Inside `withImmediateTransaction`:

```ts
insert row
throw sentinel
```

Expected: row does not exist.

- [ ] **Step 4: Write an async-callback rejection test**

Pass a callback returning a Promise.

Expected:

```text
transaction rolls back
error = write transaction callback must be synchronous
```

- [ ] **Step 5: Implement minimal code**

Use:

```ts
new DatabaseSync(path, {
  timeout: 5000,
  defensive: true,
  allowExtension: false,
});
```

Then apply the required pragmas.

- [ ] **Step 6: Verify GREEN**

```powershell
npm test -- sqlite
npm run typecheck
```

- [ ] **Step 7: Commit**

```powershell
git add src/state tests/state/sqlite.test.ts
git commit -m "feat: add deterministic SQLite state foundation"
```

---

## Task 3: Implement migration system and initial schema

**Files:**
- Create: `src/state/migration.ts`
- Create: `src/state/migrations/001-initial.ts`
- Test: `tests/state/migrations.test.ts`

**Interfaces:**
- Produces `Migration`, `migrateDatabase`, `currentSchemaVersion`, migration checksum validation and backup-before-incompatible behavior.

- [ ] **Step 1: Write RED tests**

Required:

```text
empty DB → migration 001 applied
second open → no duplicate migration
checksum drift → MIGRATION_CONFLICT
failed migration → no migration row / no partial schema
two migrators → one applied result
incompatible test migration → backup exists before apply
quick_check failure → INTEGRITY_FAILED
```

For concurrency, spawn two Node child processes against the same temp DB and ensure both exit successfully with exactly one row for migration 001.

- [ ] **Step 2: Define migration 001 SQL exactly as section 5**

No extra PH-03/04/06 tables.

- [ ] **Step 3: Implement checksum**

```text
sha256(migration.sql)
```

- [ ] **Step 4: Implement serialized migration apply**

Use `BEGIN IMMEDIATE`, re-read migration table inside the lock, and keep schema mutation + migration row atomic.

- [ ] **Step 5: Implement incompatible-backup fixture path**

Use Node `sqlite.backup()` into `${PLUGIN_DATA}/backups`.

Do not create a production incompatible migration.

- [ ] **Step 6: Verify**

```powershell
npm test -- migrations
npm run typecheck
```

- [ ] **Step 7: Commit**

```powershell
git add src/state/migration.ts src/state/migrations tests/state/migrations.test.ts
git commit -m "feat: add serialized SQLite migrations"
```

---

## Task 4: Implement canonical JSON, redaction and idempotency receipts

**Files:**
- Create: `src/state/canonical-json.ts`
- Create: `src/state/redaction.ts`
- Create: `src/state/idempotency.ts`
- Test: `tests/state/idempotency.test.ts`

**Interfaces:**
- Produces `canonicalJson`, `hashMutationRequest`, `redactSensitiveText`, `executeIdempotent`.

- [ ] **Step 1: Write canonicalization tests**

Equivalent objects with different key insertion order must hash identically.

Array order must remain significant.

- [ ] **Step 2: Write redaction tests**

Cover:

```text
Authorization: Bearer secret
Bearer secret
token=secret
api_key=secret
password=secret
github_pat_secret
ghp_secret
sk-secret
```

Expected secret material never appears in output.

- [ ] **Step 3: Write idempotency RED tests**

Required:

```text
first command applies once
same command/tool/payload returns stored result
same command with reordered JSON keys returns stored result
same command + different payload → IDEMPOTENCY_CONFLICT
same command + different tool → IDEMPOTENCY_CONFLICT
mutation + event + receipt rollback together on fault
```

- [ ] **Step 4: Implement**

Do not store raw request JSON in `command_receipts`.

- [ ] **Step 5: Verify**

```powershell
npm test -- idempotency
npm run typecheck
```

- [ ] **Step 6: Commit**

```powershell
git add src/state/canonical-json.ts src/state/redaction.ts src/state/idempotency.ts tests/state/idempotency.test.ts
git commit -m "feat: add idempotent mutation receipts"
```

---

## Task 5: Implement project inspector and persistence repositories

**Files:**
- Create: `src/state/project-inspector.ts`
- Create: `src/state/repositories.ts`
- Modify: `src/state/index.ts`
- Test: `tests/state/state-service.test.ts`

**Interfaces:**
- Produces typed repositories for projects/runs/work/decisions/evidence/resources/events/artifacts.
- Repositories are persistence adapters only; legal state transitions remain in `StateService`.

- [ ] **Step 1: Write project-inspector tests**

Use temporary Git repositories.

Verify:

```text
canonical repo root
HEAD read
remote URL credentials stripped
non-Git directory allowed
Git timeout/failure degrades without persisting stderr
fingerprint excludes HEAD
```

- [ ] **Step 2: Write repository round-trip tests**

Insert/read each PH-02 entity.

Reject invalid enum/check-constraint values.

- [ ] **Step 3: Verify optimistic work-item update**

```text
version=1 + expectedVersion=1 → update version=2
version=2 + expectedVersion=1 → VERSION_CONFLICT
```

- [ ] **Step 4: Implement repository functions with prepared statements**

No SQL string interpolation for values.

- [ ] **Step 5: Verify**

```powershell
npm test -- state-service
npm run typecheck
```

- [ ] **Step 6: Commit**

```powershell
git add src/state/project-inspector.ts src/state/repositories.ts src/state/index.ts tests/state/state-service.test.ts
git commit -m "feat: add PH-02 state repositories"
```

---

## Task 6: Implement StateService semantic mutations and evidence-bound completion

**Files:**
- Create: `src/state/state-service.ts`
- Modify: `src/state/index.ts`
- Test: `tests/state/state-service.test.ts`

**Interfaces:**
- Produces:
  - `beginWorkflow`
  - `getWorkflowSummary`
  - `getWorkItem`
  - `updateWorkItem`
  - `transitionWorkItem`
  - `requestDecision`
  - `resolveDecision`
  - `recordEvidence`
- Uses PH-01 `canTransition` and `validateCompletion`.

- [ ] **Step 1: Write failing begin/idempotency tests**

Duplicate `workflow.begin` command returns exactly the same run ID.

`durable=true` is rejected in PH-02.

- [ ] **Step 2: Write work create/patch tests**

State cannot be patched through `work.update`.

Version conflict is deterministic.

- [ ] **Step 3: Write every legal/illegal transition integration test**

Reuse the PH-01 transition matrix as the authority.

Persistence must reject an edge that PH-01 rejects.

- [ ] **Step 4: Write completion gate tests**

A `done` transition fails when:

```text
required readiness > achieved readiness
required evidence kind absent
referenced evidence missing
referenced evidence status != pass
pending work decision exists
pending run-level decision exists
```

It passes only when all PH-01 completion requirements are met.

- [ ] **Step 5: Inject a failure between entity update and event append**

Expected: neither entity mutation nor event nor receipt commits.

- [ ] **Step 6: Implement semantic service**

Each mutation must run:

```text
validate input/domain
→ executeIdempotent
→ BEGIN IMMEDIATE
→ load/verify expected version
→ apply semantic rule
→ mutate projection
→ append event
→ write receipt
→ COMMIT
```

- [ ] **Step 7: Verify**

```powershell
npm test -- state-service
npm run typecheck
```

- [ ] **Step 8: Commit**

```powershell
git add src/state/state-service.ts src/state/index.ts tests/state/state-service.test.ts
git commit -m "feat: add semantic workflow state service"
```

---

## Task 7: Implement RunResourceJournal and artifact CAS

**Files:**
- Create: `src/state/resource-journal.ts`
- Create: `src/state/artifact-store.ts`
- Modify: `src/state/index.ts`
- Test: `tests/state/resource-journal.test.ts`
- Test: `tests/state/artifact-store.test.ts`

**Interfaces:**
- Produces resource lifecycle methods and content-addressed artifact storage.

- [ ] **Step 1: Write resource lifecycle RED tests**

Required:

```text
coordinated intent → attached → running → completed
intent → failed
observed starts observed, not intent_recorded
observed cleanupRequired=true rejected
running without nativeRef rejected
stale expectedVersion rejected
cleaned forces cleanupRequired=false
event emitted per mutation
duplicate command does not duplicate resource/event
```

- [ ] **Step 2: Write artifact RED tests**

Required:

```text
same bytes → same sha/CAS path
second put reuses CAS content
10 MiB ceiling enforced
path remains under plugin data
metadata row round-trips
orphan file can be detected
```

- [ ] **Step 3: Implement resource service**

Workers do not call SQLite directly.

- [ ] **Step 4: Implement CAS atomic write**

Use same-filesystem temp + rename.

- [ ] **Step 5: Verify**

```powershell
npm test -- resource-journal artifact-store
npm run typecheck
```

- [ ] **Step 6: Commit**

```powershell
git add src/state/resource-journal.ts src/state/artifact-store.ts src/state/index.ts tests/state
git commit -m "feat: add resource journal and artifact store"
```

---

## Task 8: Implement reconciliation projection and doctor

**Files:**
- Create: `src/state/reconciliation.ts`
- Create: `src/doctor/doctor.ts`
- Create: `src/doctor/index.ts`
- Create: `scripts/doctor.mjs`
- Modify: `package.json`
- Test: `tests/state/reconciliation.test.ts`
- Test: `tests/state/doctor.test.ts`

**Interfaces:**
- Produces deterministic `workflow.summary` recovery projection and read-only doctor.

- [ ] **Step 1: Write reconciliation RED tests**

Cases:

```text
same HEAD → repoDrift=none
changed HEAD → head_changed
different project fingerprint → project_identity_changed
Git unavailable → git_unavailable
persisted running work → liveness=unknown
pending user decision → nextSafeAction=resolve_decision
repo drift outranks resume_work
cleanup warning surfaces before none
```

Define deterministic next-safe-action priority:

```text
1 project identity/head drift
2 pending decision
3 cleanup-required resource
4 persisted running/verifying reconciliation
5 active ready/running work
6 none
```

If no persisted run exists:

```text
nextSafeAction = start_run
```

- [ ] **Step 2: Write doctor RED tests**

Inject:

```text
bad schema checksum
foreign-key violation
missing artifact file
orphan CAS file
cleanup-required resource
```

Expected status:

```text
checksum / FK / quick_check failure → fail
missing referenced artifact → fail
orphan CAS → warn
cleanup-required resource → warn
```

- [ ] **Step 3: Implement doctor**

No repair/delete path.

- [ ] **Step 4: Add npm script**

```json
{
  "doctor": "node ./scripts/doctor.mjs"
}
```

- [ ] **Step 5: Verify**

```powershell
npm test -- reconciliation doctor
npm run doctor -- --json
```

- [ ] **Step 6: Commit**

```powershell
git add src/state/reconciliation.ts src/doctor scripts/doctor.mjs package.json tests/state
git commit -m "feat: add recovery reconciliation and doctor"
```

---

## Task 9: Build schema-first MCP server and tool handlers

**Files:**
- Create: `src/mcp/schemas.ts`
- Create: `src/mcp/result.ts`
- Create: `src/mcp/tools.ts`
- Create: `src/mcp/server.ts`
- Create: `src/mcp/index.ts`
- Create: `.mcp.json`
- Test: `tests/contract/ph02-mcp-schemas.test.ts`
- Test: `tests/mcp/tools.test.ts`
- Test: `tests/mcp/stdio-smoke.test.ts`

**Interfaces:**
- Exposes the exact nine-tool PH-02 surface from section 12.
- Uses only `StateService`, `ResourceJournal`, `ProjectInspector` and read-only projections.

- [ ] **Step 1: Write schema RED tests**

For every tool:

```text
unknown fields rejected
required commandId enforced on mutation
invalid versions rejected
done transition requires completion payload
non-done transition rejects completion payload
resource union operation validated
```

- [ ] **Step 2: Write annotation tests**

Assert exact table from section 13.

- [ ] **Step 3: Write in-memory MCP tests**

Use the MCP SDK's linked in-memory transport/client where possible.

Verify:

```text
workflow.begin
work.update(create)
evidence.record
work.transition(verifying)
work.transition(done)
workflow.summary
```

- [ ] **Step 4: Write idempotency through MCP**

Call the same mutating MCP request twice.

Expected one event/mutation and identical structured result.

- [ ] **Step 5: Write error-envelope tests**

`VERSION_CONFLICT`, `COMPLETION_BLOCKED`, `IDEMPOTENCY_CONFLICT` return bounded structured error objects and no stack trace.

- [ ] **Step 6: Implement tool-result helper**

Success:

```ts
{
  structuredContent: { ok: true, value },
  content: [{ type: 'text', text: conciseSummary }],
}
```

Error:

```ts
{
  isError: true,
  structuredContent: {
    ok: false,
    error: { code, message, details }
  },
  content: [{ type: 'text', text: `${code}: ${message}` }],
}
```

- [ ] **Step 7: Implement stdio server with `serveStdio`**

No HTTP listener.

- [ ] **Step 8: Create production `.mcp.json`**

Use the exact configuration from section 14.

- [ ] **Step 9: Run focused tests**

```powershell
npm test -- ph02-mcp-schemas tools stdio-smoke
npm run typecheck
npm run build
```

- [ ] **Step 10: Commit**

```powershell
git add src/mcp .mcp.json tests/contract/ph02-mcp-schemas.test.ts tests/mcp
git commit -m "feat: expose deterministic workflow state over MCP"
```

---

## Task 10: Activate `workflow-status` and `recover-work`

**Files:**
- Create: `skills/workflow-status/SKILL.md`
- Create: `skills/recover-work/SKILL.md`
- Modify: existing Skill trigger fixtures/tests
- Test: existing Skill structural tests

**Interfaces:**
- `workflow-status` consumes `workflow.summary`.
- `recover-work` consumes `workflow.summary` and optionally `work.get`.
- Neither Skill mutates state.

- [ ] **Step 1: Add trigger fixtures**

Positive examples:

```text
"What state does Workflow Next currently have for this repo?"
"Recover the workflow from the last saved state after the restart."
"Where did we stop and what is the next safe action?"
```

Negative examples:

```text
"Implement this small function."
"Search the web for the latest MCP spec."
```

- [ ] **Step 2: Create `workflow-status` with section 15 behavior**

No native-agent liveness inference.

- [ ] **Step 3: Create `recover-work` with section 16 behavior**

No transcript replay.

- [ ] **Step 4: Run Skill validation**

```powershell
npm run validate:plugin
npm test -- skill-trigger-fixtures
```

- [ ] **Step 5: Commit**

```powershell
git add skills tests
git commit -m "feat: add workflow status and recovery skills"
```

---

## Task 11: Run live Desktop/CLI persistence, restart and retry smoke

**Files:**
- Create: `evidence/ph02-state-mcp-smoke.json`

**Interfaces:**
- Produces GATE-02 live evidence.
- Does not use private session files.

- [ ] **Step 1: Build and reload the plugin**

```powershell
npm run build
npm run validate:plugin
```

Reload through the same supported local marketplace flow proven by PH-00/PH-01.

- [ ] **Step 2: Start a controlled workflow via MCP**

In a fresh Desktop chat, explicitly request use of Workflow Next MCP to:

```text
workflow.begin
→ work.update(create)
→ evidence.record
→ work.transition(running)
```

Record returned public IDs in the smoke evidence file.

- [ ] **Step 3: Test duplicate command idempotency**

Repeat one mutation with the same `commandId`.

Expected:

```text
same result
no duplicate event
no version increment
```

- [ ] **Step 4: Test conflict**

Repeat the same `commandId` with a changed payload.

Expected:

```text
IDEMPOTENCY_CONFLICT
```

- [ ] **Step 5: Test optimistic conflict**

Use an old `expectedVersion`.

Expected:

```text
VERSION_CONFLICT
```

- [ ] **Step 6: Test evidence-bound completion**

Attempt `done` before required evidence.

Expected:

```text
COMPLETION_BLOCKED
```

Record pass evidence, then transition with the correct evidence IDs.

Expected:

```text
done
```

- [ ] **Step 7: Restart Desktop/MCP process**

Start a fresh chat after restart.

Invoke `workflow-status`.

Expected persisted run/work/evidence.

- [ ] **Step 8: Test repo drift behavior**

Make a harmless test commit/change in a disposable fixture repository or switch HEAD in a controlled test repo.

Invoke `recover-work`.

Expected:

```text
repoDrift=head_changed
nextSafeAction=inspect_repo_drift
```

No claim that old worker is alive.

- [ ] **Step 9: Repeat minimal smoke in CLI**

Use a fresh CLI invocation and the same plugin.

Verify read-only status and one idempotent mutation.

- [ ] **Step 10: Run doctor**

```powershell
npm run doctor -- --json
```

Expected `pass` or only explicitly understood warnings from the controlled resource fixture.

- [ ] **Step 11: Write `evidence/ph02-state-mcp-smoke.json`**

Shape:

```json
{
  "smokeVersion": 1,
  "date": "YYYY-MM-DD",
  "desktopBuild": "observed-build",
  "cliVersion": "observed-version",
  "nodeVersion": "v24.x.y",
  "mcp": {
    "start": "pass",
    "createWork": "pass",
    "duplicateIdempotency": "pass",
    "idempotencyConflict": "pass",
    "optimisticConflict": "pass",
    "completionGuard": "pass",
    "restartPersistence": "pass",
    "repoDrift": "pass"
  },
  "skills": {
    "workflowStatus": "pass",
    "recoverWork": "pass"
  },
  "doctor": "pass",
  "hooks": "degraded"
}
```

Do not store absolute paths or raw transcripts.

- [ ] **Step 12: Commit**

```powershell
git add evidence/ph02-state-mcp-smoke.json
git commit -m "test: prove PH-02 state recovery and MCP semantics"
```

---

## Task 12: Conditional hook telemetry adapter

**This task is conditional and never blocks GATE-02.**

Run it only if TP-02A shows the current trusted plugin hook path is reliable enough to justify a tiny best-effort adapter.

**Files when enabled:**
- Create: `src/hooks/normalize.ts`
- Create: `src/hooks/index.ts`
- Create: `hooks/hooks.json`
- Test: `tests/state/hook-normalization.test.ts`

**Interfaces:**
- Hook input may add an observational event/telemetry hint.
- Hook input never transitions work to `done`, resolves decisions, assigns authority or claims native liveness.

- [ ] **Step 1: Define an allowlist of hook-derived fields**

Store only:

```text
event name
timestamp
native thread/resource identifier if publicly supplied
bounded status code
```

Do not store prompts/tool arguments/raw output.

- [ ] **Step 2: Normalize untrusted/malformed hook input**

Malformed input must be ignored/logged locally without breaking state.

- [ ] **Step 3: Ensure semantic transitions do not call hook code**

Add a test proving `work.transition` behavior is identical with hook adapter absent.

- [ ] **Step 4: Add one low-risk hook only**

Prefer observational lifecycle enrichment such as `SubagentStart`/`SubagentStop` if current platform behavior is reliable.

Do not add `PreToolUse` as correctness/security enforcement.

- [ ] **Step 5: Verify hook failure degradation**

Force the hook command to fail.

Expected: explicit MCP state continues to work.

- [ ] **Step 6: Commit only if all conditions are met**

```powershell
git add src/hooks hooks tests/state/hook-normalization.test.ts
git commit -m "feat: add optional hook telemetry enrichment"
```

If conditions are not met, skip this task and keep `hooks=degraded` in evidence.

---

## Task 13: Final PH-02 verification and scope audit

**Files:**
- Modify: `PROVENANCE.md` only if new external package/source dependencies require it.
- Read/verify: current Master, Roadmap, PH-01 and this PH-02 plan.

**Interfaces:**
- Produces GATE-02 result.
- Creates no narrative compatibility report.

- [ ] **Step 1: Run clean install and full verification**

```powershell
npm ci
npm run check
npm run build
npm run doctor -- --json
```

Expected all pass.

- [ ] **Step 2: Run state/MCP tests twice**

```powershell
npm test
npm test
```

The second run must not depend on stale temp state.

- [ ] **Step 3: Inspect package/runtime dependencies**

Confirm:

```text
node:sqlite only
@modelcontextprotocol/server v2
@modelcontextprotocol/client test-only
no ORM
no better-sqlite3
no Python runtime
no HTTP server
```

- [ ] **Step 4: Inspect semantic correctness path**

Confirm each mutation is:

```text
MCP schema
→ StateService
→ idempotency
→ BEGIN IMMEDIATE
→ projection + event + receipt
→ COMMIT
```

No hook-only path exists.

- [ ] **Step 5: Inspect scope leakage**

Reject accidental:

```text
Board/UI
Context Index
Companion runtime
agent spawning
model routing/config loader
worktree creation
PH-05 authority enforcement
PH-06 token/eval parser
PH-08 durable mode
docs/agent_docs
private Codex session parsing
```

- [ ] **Step 6: Verify storage isolation**

All runtime writes must remain under validated `PLUGIN_DATA`.

Repository writes are limited to source/tests/evidence/project-control files explicitly implemented by the developer.

- [ ] **Step 7: Verify event/privacy constraints**

Search code and test fixtures for:

```text
prompt storage
chain-of-thought storage
raw stdout persistence
raw stderr persistence
Authorization/Bearer secrets
```

Expected no production path persists them by default.

- [ ] **Step 8: Verify restart/retry properties**

Evidence must cover:

```text
process restart
duplicate command
conflicting duplicate
stale expectedVersion
completion blocked by evidence
repo drift
degraded hooks
```

- [ ] **Step 9: Update provenance only if needed**

Record MCP SDK and current official source references at a high level; do not copy upstream implementation text.

- [ ] **Step 10: Commit final verification-only edits if any**

```powershell
git add PROVENANCE.md evidence tests
git commit -m "test: close PH-02 deterministic state gate"
```

Skip if there are no new changes.

---

# 20. PH-02 Test Matrix

| Test class | Required |
|---|---|
| TP-02A MCP `PLUGIN_DATA` create/read/append/rename/delete | yes |
| TP-02A SQLite transaction/reopen | yes |
| TP-02A real restart persistence | yes |
| Windows hook re-probe | yes, informational/degraded allowed |
| Node 24.12 floor | yes |
| SQLite pragma assertions | yes |
| `BEGIN IMMEDIATE` rollback | yes |
| no async write transaction | yes |
| migration checksum | yes |
| concurrent migration serialization | yes |
| backup-before-incompatible fixture | yes |
| `quick_check` / FK check | yes |
| canonical request hashing | yes |
| duplicate command idempotency | yes |
| mismatched duplicate conflict | yes |
| mutation+event+receipt atomicity | yes |
| optimistic version conflict | yes |
| PH-01 transition matrix integration | yes |
| evidence-bound `done` | yes |
| pending decision blocks completion | yes |
| resource lifecycle | yes |
| observed resource cannot claim cleanup | yes |
| artifact CAS dedupe/path containment | yes |
| repo fingerprint + HEAD drift | yes |
| liveness remains unknown after restart | yes |
| doctor fail/warn classifications | yes |
| MCP schema strictness | yes |
| MCP annotation truthfulness | yes |
| MCP structured error envelope | yes |
| stdio child-process smoke | yes |
| fresh Desktop state smoke | yes |
| fresh CLI state smoke | yes |
| `workflow-status` Skill smoke | yes |
| `recover-work` Skill smoke | yes |
| Board tests | no — PH-07 |
| agent spawn/model routing | no — PH-04 |
| Context Companion | no — PH-03 |
| write-set/authority enforcement | no — PH-05 |
| token attribution | no — PH-06 |
| durable worktrees | no — PH-08 |

---

# 21. PH-02 Acceptance Gate

PH-02 is `PASS` only when all are true:

- [ ] PH-01 is already PASS.
- [ ] TP-02A proves the actual PH-01 local-plugin MCP process receives a writable persistent `PLUGIN_DATA`.
- [ ] SQLite survives real process/Desktop restart under `PLUGIN_DATA`.
- [ ] No arbitrary storage fallback exists.
- [ ] Node floor is compatible with the chosen built-in SQLite API.
- [ ] WAL/foreign-keys/FULL synchronous/busy-timeout/defensive mode are verified.
- [ ] migrations are serialized and checksum-validated.
- [ ] incompatible-migration backup behavior is tested.
- [ ] every state mutation is idempotent by `commandId`.
- [ ] same idempotency key with changed payload is rejected.
- [ ] work-item optimistic version conflicts are detected.
- [ ] entity mutation + event + command receipt are atomic.
- [ ] PH-01 transition rules are enforced by persisted transitions.
- [ ] `done` cannot bypass readiness/evidence/pending-decision checks.
- [ ] native `idle`/stop is not treated as acceptance.
- [ ] RunResourceJournal records intent/observed ownership truthfully.
- [ ] observed resources cannot claim cleanup ownership.
- [ ] artifact contents are outside SQLite and content-addressed.
- [ ] state/artifacts are contained under plugin data.
- [ ] secret-bearing text is redacted before persistence.
- [ ] raw prompts/private source/chain-of-thought are not stored.
- [ ] `workflow.summary` reports repo drift and liveness uncertainty honestly.
- [ ] doctor detects integrity/schema/artifact/resource problems without mutating.
- [ ] schema-first stdio MCP tools work in Desktop and CLI.
- [ ] MCP annotations are truthful.
- [ ] `workflow-status` and `recover-work` are active and read-only.
- [ ] restart recovery does not depend on transcript replay.
- [ ] hook failure does not break explicit state semantics.
- [ ] no Board/context-agent/orchestration/model-routing/durable-mode implementation leaked into PH-02.
- [ ] no docs subsystem/agent_docs was introduced.

If all pass, next allowed phase is **PH-03 Conditional Context Companion**.

---

# 22. PH-02 Branching Rules

## BR-PH02-01: MCP storage fails

```text
TP-02A MCP PLUGIN_DATA FAIL
→ PH-02 BLOCKED
→ storage-root ADR
→ no home/repo fallback
```

Do not continue implementation.

## BR-PH02-02: Hooks still fail

```text
hooks = degraded
→ skip Task 12
→ PH-02 may still PASS
```

## BR-PH02-03: `node:sqlite` unavailable/disabled on the required host

Do not silently install another SQLite library.

Record blocker and perform an architecture/dependency review.

## BR-PH02-04: WAL cannot be enabled

Treat storage as unsupported for the selected root.

Do not silently continue with rollback-journal mode.

## BR-PH02-05: migration/integrity check fails

Server must fail closed for mutating tools.

Read-only doctor should return the integrity error.

## BR-PH02-06: state schema needs PH-03/04 fields

Do not pre-create speculative tables.

Add them in their owning phase migration.

## BR-PH02-07: MCP protocol/API changed during implementation

Use the current official MCP v2 SDK contract, update the thin MCP adapter only, and preserve the semantic StateService interfaces.

## BR-PH02-08: live state differs from persisted state

Report `partial/unknown` and reconcile.

Never infer success from stale persisted status.

---

# 23. Performance and Reliability Constraints

PH-02 is correctness-first.

Do not benchmark microseconds before semantic correctness is proven.

Still enforce these design limits:

- one MCP process uses one primary synchronous SQLite connection;
- multiple MCP processes may coexist against WAL;
- every write is short and `BEGIN IMMEDIATE`;
- no artifact bytes in SQLite;
- no unbounded `SELECT *` over full event history in user-facing tools;
- `workflow.summary` returns bounded current projection, not every event;
- event payloads remain small curated deltas;
- default busy timeout is 5 seconds;
- no custom WAL checkpoint scheduling;
- no long-running transaction while waiting on Git/process/network/model work;
- Git inspection happens before/after DB transaction, never inside it.

PH-06 may benchmark the substrate later if it becomes material to end-to-end cost/latency.

---

# 24. Security Review Checklist

Before GATE-02:

- [ ] `PLUGIN_DATA` is host supplied and validated.
- [ ] no path traversal from tool inputs reaches DB/artifact paths.
- [ ] artifact paths are generated from hashes.
- [ ] SQLite extensions are disabled.
- [ ] defensive mode enabled.
- [ ] trusted schema disabled.
- [ ] SQL values are bound parameters.
- [ ] no dynamic table/column names from model input.
- [ ] repo inspection uses `execFile`, not shell interpolation.
- [ ] Git remote credentials are stripped before storage.
- [ ] secrets are redacted in evidence/error text.
- [ ] no raw prompt storage.
- [ ] no chain-of-thought storage.
- [ ] no raw private session-file parser.
- [ ] MCP errors omit stack traces.
- [ ] destructive/idempotent/open-world/read-only annotations match actual tools.
- [ ] hook input is treated as untrusted optional telemetry.
- [ ] no hook can mark work done or resolve a decision.
- [ ] no tool can delete history in PH-02.

---

# 25. Execution Guidance for Codex Sol High

For PH-02 implementation:

- execute Task 0 first and stop immediately on the storage-fail branch;
- do not start SQLite code while TP-02A is unresolved;
- use TDD per task;
- keep state code cohesive and small; do not make one giant `database.ts`;
- preserve PH-01 domain contracts; only add persistence/runtime-specific types where necessary;
- use the semantic StateService as the only mutation authority;
- keep MCP handlers thin;
- do not implement future agent/runtime policy because the user-model/subagent configuration work belongs PH-04;
- do not add docs ceremony;
- do not let a passing unit test substitute for real Desktop restart smoke;
- when a current SDK/API detail differs from this plan, use the current official contract and record the smallest plan deviation;
- after each task run its focused tests;
- after Task 13 run the complete GATE-02 suite.

Expected final implementation report:

```text
PH-02 RESULT: PASS | PASS_WITH_AMENDMENT | BLOCKED

TP-02A
- MCP PLUGIN_DATA: PASS/FAIL
- restart persistence: PASS/FAIL
- hook status: PASS/DEGRADED

Implemented
- SQLite substrate: ...
- migrations: ...
- idempotency: ...
- semantic state: ...
- resource journal: ...
- artifact store: ...
- MCP: ...
- recovery/status Skills: ...

Verification
- npm ci: ...
- npm run check: ...
- npm run build: ...
- npm test: ...
- npm run doctor -- --json: ...
- Desktop restart smoke: ...
- CLI smoke: ...

Correctness audit
- hook-only correctness: absent
- arbitrary storage fallback: absent
- private Codex state dependency: absent
- Board/orchestration runtime: absent
- docs subsystem: absent

Deviations
- ...

Next allowed action
- PH-03 Conditional Context Companion
```

---

# 26. Source/Version Notes for the Implementer

Use current official sources at implementation time, not stale copied snippets.

Normative/primary references used to shape this plan:

1. Current Workflow Next Master/Roadmap/PH-01 project-control artifacts.
2. OpenAI Codex hook documentation:
   `https://learn.chatgpt.com/docs/hooks`
   - plugin hooks;
   - trust;
   - `PLUGIN_ROOT`;
   - `PLUGIN_DATA`;
   - platform-specific command support.
3. Current OpenAI Codex source for plugin MCP loading:
   `https://github.com/openai/codex`
   - local `.codex-plugin/plugin.json`;
   - legacy `.mcp.json`;
   - Agent Plugin MCP handling;
   - plugin data-root behavior.
4. MCP TypeScript SDK v2:
   `https://ts.sdk.modelcontextprotocol.io/v2/`
   - stable v2 packages;
   - `McpServer`;
   - `serveStdio`;
   - Standard Schema/Zod;
   - tool annotations.
5. Node.js 24 LTS SQLite:
   `https://nodejs.org/docs/latest-v24.x/api/sqlite.html`
   - `DatabaseSync`;
   - timeout;
   - defensive mode;
   - backup.
6. SQLite official WAL/PRAGMA documentation:
   `https://www.sqlite.org/wal.html`
   `https://www.sqlite.org/pragma.html`
   - WAL behavior;
   - busy handling;
   - synchronous durability;
   - foreign keys;
   - integrity checks.

Do not copy implementation code from `workflow-herdr` or `codex_workflow`; their operational patterns are provenance/reference inputs only.
