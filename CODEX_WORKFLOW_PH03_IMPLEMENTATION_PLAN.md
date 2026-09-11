# PH-03 Context Index + Conditional Companion Implementation Plan — Rev 1.3

**Status:** CURRENT executable phase — implementation/code gates complete, native Companion evidence PARTIAL  
**Baseline:** `811eb8350f06dd0aa60f420d14d485aaa5f3e9be`  
**Last verified code gate:** `b441336ea65ed7921c81d76dc2927639fe9ff50c` — CI GREEN, 236 tests passed / 1 skipped, plugin validation passed  
**Cross-platform query benchmark:** GitHub Actions run `34586655319` — Ubuntu 24.04 + Windows latest GREEN  
**Master:** `CODEX_WORKFLOW_NEXT_MASTER_PLAN.md` Rev 4.4  
**Roadmap:** `CODEX_WORKFLOW_NEXT_ROADMAP.md` Rev 2.4

## Goal

Build a provenance-aware, bounded Context Index and a correctly isolated fresh Companion handoff path on top of the completed PH-02 SQLite/MCP substrate. Repository/state sources remain authoritative; Context Index is a derived cache that may become stale. PH-03 must not introduce PH-04 routing/runtime, mandatory Companion behavior, a documentation subsystem, embeddings/vector search, background indexing, custom scheduling, Terra/relay layers, or external structural-provider adapters.

## PH-02 boundary

PH-01 and PH-02 are complete historical baselines. Do not redesign their repository identity/state unless a correctness defect is demonstrated. Reuse PH-02 storage root, migration runner, `BEGIN IMMEDIATE` transaction helper, idempotency receipts, redaction, project inspector, repositories, doctor conventions, MCP result/error contracts and Agent Plugins v1 root `plugin.json` + `mcp.json` packaging.

PH-03 adds only additive state/schema needed by Context Index.

## Corrected mutation/audit contract

The PH-02 `workflow_events` schema is run-scoped and does not have a `context` entity type. PH-03 therefore does **not** create standalone project-only context audit events and does not expose a standalone persisted `context.record` MCP command.

The sole public persisted Context Index mutation is:

```ts
ContextIndexService.ingestDelta({
  commandId,
  projectId,
  runId,
  expectedTaskId,
  delta,
})
```

Before the write transaction it validates project ownership, source URIs and all required source fingerprints. Then one PH-02 `executeIdempotent()` transaction performs:

```text
prepared context row mutations
+ exactly one bounded run-scoped workflow event
  entity_type = run
  entity_id   = runId
  event_type  = context.delta_ingested
+ command receipt
```

Low-level context row mutation is synchronous/internal and MUST NOT open its own transaction, create its own command receipt, append a separate event, or perform filesystem/model/network work. This avoids nested `BEGIN IMMEDIATE` transactions and preserves the frozen PH-02 audit model.

## Context invariants

- Context Index is cache/index, not truth.
- Access is strictly project-scoped.
- `verifiedAt`, retrieval count, repeated use, worker citation and successful consumers never confer authority or freshness.
- Resolvable source freshness comes only from current source/evidence identity.
- `repo:` sources use exact-byte SHA-256; Git HEAD is provenance, not content identity.
- Missing/changed source becomes stale; unchanged exact hash remains fresh even if HEAD changed.
- `decision:`, `evidence:` and `work:` sources hash PH-02 canonical public semantic records.
- `external:` sources are unverifiable in PH-03 unless an explicit verified hash is already supplied by an authoritative contract; PH-03 itself does not fetch the web.
- Stale/unverifiable items are excluded from hydration by default.
- No raw file bodies, prompts, transcripts, reasoning, command output or embeddings are persisted.
- Repository-relative sources must remain inside canonical project root after realpath/symlink resolution.
- Query/hydration/delta sizes are bounded.

## Storage

Migration `002-context-index.ts` adds a `STRICT` `context_items` table with:

```text
context_id
project_id FK projects
logical_key
kind
scope
summary
source_uri
source_hash nullable
git_sha nullable
verified_at
stale
replaces_context_id nullable FK context_items
created_at
updated_at
```

Unique logical version:

```text
(project_id, logical_key, ifnull(source_hash, ''))
```

`logicalKey = SHA256(canonicalJson({ projectId, kind, scope, sourceUri }))`.

A changed source hash creates a new logical version and marks older versions for the same logical key stale in the same semantic transaction. Migration 002 must preserve SQLite `STRICT` invariants and migration checksum/integrity verification.

Doctor must stop hard-coding schema version 1. Introduce one authoritative known migration list and validate the full known chain/checksums plus current `PRAGMA user_version` generically.

## Bounded defaults

```ts
MAX_CONTEXT_SUMMARY_CHARS = 1600
MAX_CONTEXT_QUERY_TERMS = 8
MAX_CONTEXT_QUERY_SCOPES = 8
MAX_CONTEXT_QUERY_RESULTS = 12
DEFAULT_CONTEXT_QUERY_RESULTS = 8
MAX_HYDRATION_CONTEXT_ITEMS = 10
MAX_HYDRATION_TOTAL_CHARS = 14000
MAX_CONTEXT_DELTA_ITEMS = 16
MAX_CONTEXT_CANDIDATES = 200
```

These are correctness/boundedness limits, not token-savings claims. PH-06 may recalibrate them.

## Deterministic ranking

Score candidates with no embeddings/fuzzy matching:

```text
+100 exact requested scope
 +60 candidate scope starts with requested scope + '/'
 +20 term in sourceUri, max +80
 +15 term in scope, max +60
  +5 term in summary, max +20
 +10 persisted stale == false
```

Normalize terms with Unicode NFKC + lowercase + trim. Tie-break: `score DESC`, `verifiedAt DESC`, `contextId ASC`.

Candidate admission is bounded before source verification. Current evidence-backed policy is:

```text
1 requested scope:
  exact scope reservoir <= 80
  descendant reservoir <= 60
2..8 requested scopes:
  combined exact/descendant reservoir <= 120
always:
  union with recent candidate pool <= 200
  deduplicate -> deterministic score -> top 200 -> source freshness
```

The repository reads one additional metadata row where necessary to distinguish an exact full window from actual overflow; source verification remains bounded to 200 candidates. Scope-reservoir truncation is an admission detail and does not itself imply that the global candidate universe is truncated when the exact recent pool proves otherwise.

## Hydration

`context.hydrate` builds a strict Companion capsule from current project/run identity, at most 10 fresh Context Items, explicitly selected same-project/run Decision/Evidence references, objective/scopes/terms and unresolved questions. Total context summary content is capped at 14,000 characters. It must not read all indexed source bodies or bootstrap the whole repository.

## ContextDelta

A delta is strict and bounded to 16 items. Wrong task ID rejects. Base HEAD mismatch is surfaced as `stale_base`; it is not silently accepted. `repo:` new/changed/stale items require source hash. Source mismatch during ingestion rejects the whole command. `decision_needed` does not create/resolve PH-02 Decisions. `stale` only invalidates matching cache state. No partial ingestion.

## MCP surface

Add exactly four PH-03 tools:

```text
context.get           read-only
context.query         read-only
context.hydrate       read-only
context.ingest_delta  mutating/idempotent
```

Do not add routing, spawn, model-selection, Investigator or PH-04 tools.

## Companion live contract

One fresh read-only `context_companion` worker is used only for PH-03 live proof. It MUST use explicit `fork_turns="none"`. Hydration capsule is the intended context input; a parent-only marker must not leak into the worker result. Worker performs no repository writes and returns schema-valid ContextDelta. Main/runtime remains acceptance, causal and architecture owner.

If fresh isolation cannot be sufficiently observed, PH-03 is `PARTIAL`; do not relabel missing evidence as PASS.

## Task sequence

### Task 0 — Transition and RED contracts

- [x] create isolated PH-03 branch from exact PH-02 main
- [x] switch root `AGENTS.md` to PH-03
- [x] add reproducible GitHub Actions `npm ci` + `npm run check` gate
- [x] remove stale `.work/` plan copies and ignore `.work/`
- [x] preserve PH-02 baseline regression GREEN
- [x] add RED PH-03 domain/MCP/project-isolation contracts

Required negative contracts include: project A context ID queried as B → not found; same source URI in two projects remains isolated; wrong-project delta rejected; stale/missing source excluded from hydration.

### Task 1 — Domain schemas

- [x] extract reusable `ContextKindSchema` without changing PH-01 values
- [x] add strict canonical Context source URI schema/parser
- [x] add query/hit/result schemas
- [x] add hydration capsule schemas
- [x] add ContextDelta schemas
- [x] RED → GREEN focused contract tests

### Task 2 — Migration 002 + ContextRepository

- [x] RED migration/repository tests
- [x] add `002-context-index.ts` as `STRICT`
- [x] introduce authoritative `ALL_MIGRATIONS`
- [x] generic migration-chain doctor validation
- [x] repository methods always require `projectId` for reads/mutations
- [x] bounded SQL candidate retrieval (`<=200`)
- [x] no source-body columns

### Task 3 — Source URI + resolver/fingerprint

- [x] RED traversal/symlink/cross-project/state-source tests
- [x] canonical `repo:` path containment
- [x] streaming SHA-256 exact bytes
- [x] canonical JSON hashes for PH-02 Decision/Evidence/Work entities
- [x] `external:` remains unverifiable/no fetch

### Task 4 — Ranking + get/query

- [x] RED exact scoring/NFKC/tie-break tests
- [x] RED bounded query and freshness tests
- [x] implement exact deterministic ranking
- [x] revalidate only bounded selected candidates
- [x] stale/unverifiable excluded by default
- [x] retrieval itself never refreshes validity
- [x] same-kind scope starvation and 1/2/4/8-scope admission regression coverage
- [x] exact candidate-window truncation semantics (`200` vs `201`) covered at service and repository boundaries

### Task 5 — Hydration

- [x] RED max-items and 14k budget tests
- [x] RED same-project/run authority tests
- [x] build fresh-only capsule
- [x] drop/trim summaries deterministically; never truncate URI/hash

### Task 6 — Delta validation + atomic ingestion

- [x] RED task/base/source/project/idempotency tests
- [x] preflight all source snapshots before transaction
- [x] redact summaries before persistence
- [x] same command replay returns same result; different request conflicts
- [x] changed source marks prior logical version stale
- [x] one invalid item rejects whole command
- [x] one `executeIdempotent()` transaction owns mutations + one `context.delta_ingested` run event + receipt

### Task 7 — MCP

- [x] RED strict schema/annotation/error tests
- [x] register four tools as thin adapters
- [x] no PH-04 tool leakage
- [x] legacy stdio smoke GREEN
- [x] modern MCP negotiation + PH-03 production stdio calls GREEN

### Task 8 — Doctor + restart

- [x] context schema/index/FK integrity checks
- [x] generic known migration-chain verification
- [x] restart persistence and stale-source behavior
- [x] PH-02 doctor behavior remains valid

### Task 9 — Minimal Skill update

- [x] update `skills/orchestrate-work/SKILL.md` only enough to describe optional explicit PH-03 hydration/Companion handoff
- [x] keep Companion optional; no automatic routing or mandatory Companion behavior

### Task 10 — Live Companion smoke

- [x] record explicit PARTIAL evidence in `evidence/ph03-companion-smoke.json` rather than infer native behavior from tests/CI
- [ ] execute the native Desktop/CLI live smoke when an authorized Codex agent-spawn surface is actually available
- [ ] record exact native surface/Codex build, explicit `fork_turns="none"`, parent-marker isolation, schema-valid live ContextDelta and no-repository-write observation

Current blocker: this GitHub/Actions execution environment exposes repository and CI capabilities but no authorized native Codex Desktop/CLI agent-spawn surface. `surface`, `codexBuild`, `forkTurnsNone`, parent-marker isolation, live delta validity and no-write behavior therefore remain explicitly unobserved. Unit/contract tests do not substitute for this proof.

### Task 11 — Full gate

- [x] `npm ci`
- [x] `npm run check`
- [x] focused PH-03 tests
- [x] restart/integration tests
- [x] plugin validation
- [x] PH-02 regression suite
- [x] live Companion evidence is explicitly classified `PARTIAL` rather than falsely PASS
- [x] scope audit
- [x] cross-platform PH-03 query benchmark GREEN on Ubuntu 24.04 and Windows latest

Latest verified code gate at `b441336ea65ed7921c81d76dc2927639fe9ff50c`:

```text
39 test files passed / 1 skipped
236 tests passed / 1 skipped
Biome GREEN
plugin validation passed
legacy stdio smoke GREEN
modern MCP negotiation + PH-03 stdio calls GREEN
```

## Acceptance gate

PH-03 may PASS only when:

- Context Index storage/query/hydration is deterministic, bounded and project-isolated;
- source-linked freshness is verified against current source/evidence identity;
- `verifiedAt`/retrieval/use do not create freshness/authority;
- ContextDelta ingestion is whole-command atomic and idempotent;
- no nested write transaction exists in the Context mutation path;
- audit remains compatible with PH-02 run-scoped events;
- restart/retry preserves correctness;
- four MCP tools have truthful strict schemas/annotations;
- PH-02 regression remains GREEN;
- Companion isolation is PASS, or the phase is explicitly PARTIAL with downstream assumptions narrowed;
- no PH-04 routing/runtime, Terra/relay, Serena/structural provider, embeddings/vector DB, documentation subsystem or economic claim leaked into scope.

Current disposition: **PH-03 PARTIAL**. The implementation/code/CI side of the acceptance gate is satisfied; native Companion isolation is still unobserved, so PH-03 must not be relabeled PASS and PH-04 must not assume native Companion isolation has been proven.

## PH-04 entry outputs

PH-04 may depend only on:

```text
ContextIndexService.get/query/ingestDelta
buildCompanionHydrationCapsule
validateContextDelta
context.get/query/hydrate/ingest_delta
PH-03 live capability evidence
```

PH-04 owns route selection, config/model mapping, general worker lifecycle, capability preflight, write-worker isolation, retry/escalation, batching candidate and delegated-package non-duplication.