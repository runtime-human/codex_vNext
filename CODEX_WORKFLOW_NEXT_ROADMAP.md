# Codex Workflow Next — Product & Engineering Roadmap

**Status:** normative post-PH-02 roadmap
**Revision:** **2.4**
**Date:** 2026-09-10
**Master:** `CODEX_WORKFLOW_NEXT_MASTER_PLAN.md`  
**Current executable plan:** `CODEX_WORKFLOW_PH03_IMPLEMENTATION_PLAN.md`
**PH-00:** completed as **PASS_WITH_AMENDMENTS**
**PH-01 / PH-02:** completed; their implementation plans are historical baselines

**Packaging gate:** production uses Agent Plugins v1 root manifests. The legacy
MCP packaging is retained only as a negative compatibility result because it
does not receive `PLUGIN_DATA`; no storage fallback is permitted.

> Roadmap controls sequencing and gates. Master defines architecture. Per-phase detailed plans define exact implementation work.

---

<a id="rm-idx-00"></a>
## [RM-IDX-00] Index

| Area | IDs |
|---|---|
| Rules | `RM-01..10` |
| Horizons | `HZ-00..05` |
| Cross-cutting streams | `STR-01..08` |
| Completed capability proof | `PH-00` |
| Foundation | `PH-01` |
| State/MCP | `PH-02` |
| Context | `PH-03` |
| Delegation | `PH-04` |
| Verification | `PH-05` |
| Core eval | `PH-06` |
| Board | `PH-07` |
| Durable | `PH-08` |
| Calibration | `PH-09` |
| Public V1 | `PH-10` |
| Targeted re-probes | `TP-02A`, `TP-04A`, `TP-06A`, `TP-08A` |
| Branches | `BR-01..11` |
| Risks | `RMRISK-01..20` |

---

# 1. Roadmap Rules

<a id="rm-01"></a>
## [RM-01] Evidence-gated, not calendar-gated

No phase advances because a date arrived. It advances because previous gate/evidence is sufficient.

<a id="rm-02"></a>
## [RM-02] Native primitive first

At every detailed-plan start, recheck current Codex docs/changelog before designing custom functionality.

<a id="rm-03"></a>
## [RM-03] PH-00 negative findings are scoped

A degraded host capability blocks only the phase that needs it. Do not re-run entire H0 unless the extension model itself changes.

<a id="rm-04"></a>
## [RM-04] Core value before UX/durability expansion

PH-06 remains the principal product-value hinge before production Board/Durable expansion.

<a id="rm-05"></a>
## [RM-05] Main/native Codex remain runtime owner

No phase may introduce own scheduler/worktree/review/terminal runtime without explicit roadmap amendment.

<a id="rm-06"></a>
## [RM-06] Public vs diagnostic evidence remain separate

Private local trace adapter may guide engineering but cannot become product/public claim dependency.

<a id="rm-07"></a>
## [RM-07] Plus budget is explicit

Benchmark phases use staged campaigns and a user-configured budget; no full matrix on every code change.

<a id="rm-08"></a>
## [RM-08] Removal is a valid roadmap outcome

Feature with negative ROI is narrowed/removed rather than defended because it was planned.

<a id="rm-09"></a>
## [RM-09] No documentation subsystem

Durable project-control artifacts remain, but no phase may introduce a permanent documentation agent/stage or duplicate Markdown solely to mirror code/state. Public user documentation is a PH-10 release deliverable.

<a id="rm-10"></a>
## [RM-10] Safety patterns enter at the phase that owns the mutation

Preflight-before-mutation and resource journaling are cross-cutting invariants, not reasons to pull runtime/state into PH-01. PH-02 owns the transactional resource journal; PH-04 owns orchestration-time capability preflight; PH-08 extends preflight for runtime isolation.

`codex_workflow` v1.1.15 remains a policy/reference baseline, not the implementation base. We adopt its tri-lane context-routing and delegated-ownership hypotheses selectively, while rejecting mandatory Companion, fixed Light/Medium/Heavy ownership, `agent_docs`/Archivist and Python lifecycle as defaults. Fork/adopt is reconsidered only if upstream later converges on the plugin/MCP/SQLite/evidence/recovery/Board product layer and wins a measured comparison.

---

# 2. Horizons

<a id="hz-00"></a>
## [HZ-00] Platform Proof — COMPLETED
PH-00.

<a id="hz-01"></a>
## [HZ-01] Minimal Foundation
PH-01 and PH-02.

<a id="hz-02"></a>
## [HZ-02] Workflow Intelligence Core
PH-03..05.

<a id="hz-03"></a>
## [HZ-03] Prove Marginal Value
PH-06.

<a id="hz-04"></a>
## [HZ-04] Attention UX + Durability
PH-07..08 only if gates permit.

<a id="hz-05"></a>
## [HZ-05] Calibrate / Harden / Release
PH-09..10.

---

# 3. Cross-cutting Streams

<a id="str-01"></a>
## [STR-01] Compatibility
Track Desktop/CLI/model/plugin surfaces by tested build.

<a id="str-02"></a>
## [STR-02] Provenance
Clean-room references and license matrix throughout.

<a id="str-03"></a>
## [STR-03] Security/authority
Native sandbox + authority narrowing + deterministic validation.

<a id="str-04"></a>
## [STR-04] Trace/eval
Public trace first; diagnostic family adapter controlled.

<a id="str-05"></a>
## [STR-05] Project truth / durable control artifacts
Current code/tests + canonical Master/Roadmap/current phase plan + provenance + accepted decisions/eval evidence when materially required. No docs agent or mandatory documentation stage.

<a id="str-06"></a>
## [STR-06] UX
Text → inline → fullscreen; no sidebar dependency.

<a id="str-07"></a>
## [STR-07] Testing
Unit/contract + live Codex smoke + controlled eval.

<a id="str-08"></a>
## [STR-08] Release/rollback
Every material feature must have disable/remove path.

---

# 4. Dependency Graph

```text
PH-00 COMPLETE: PASS_WITH_AMENDMENTS
          ↓
PH-01 Plugin + Domain Foundation          COMPLETE
          ↓
TP-02A MCP PLUGIN_DATA / Windows hook re-probe  COMPLETE/RESOLVED
          ↓
PH-02 Explicit State + MCP                COMPLETE
          ↓
PH-03 Context Companion                   ← NOW
          ↓
TP-04A write-worker + managed-worktree smoke
          ↓
PH-04 Adaptive Delegation / Task protocol / batching candidate
          ↓
PH-05 Verification / Authority
          ↓
TP-06A trace observer preflight
          ↓
PH-06 A/B/C CORE VALUE GATE
      ┌────────────┬──────────────┐
      │ value      │ weak/no core │
      ↓            ↓              │
PH-07 Board     narrow core        │
      ↓        Board UX optional   │
TP-08A runtime isolation           │
      ↓                            │
PH-08 Durable Beta only if justified
      ↓
PH-09 Calibration / Promotion
      ↓
PH-10 Public V1
```

---

# 5. Phase Roadmap

<a id="ph-00"></a>
# [PH-00] Codex Desktop Capability Proof — COMPLETED

**Final status:** `PASS_WITH_AMENDMENTS`.

## Proven

- local plugin lifecycle;
- fresh Skills;
- deterministic MCP data tool;
- inline/fullscreen/follow-up Board host;
- explicit `fork_turns=none` worker task/result 3/3;
- TaskDelta follow-up;
- two independent siblings;
- inherited configured MCP;
- root `codex exec --json` usage;
- memories-off correctness;
- native worktree/review/terminal boundary;
- no public sidebar.

## Degraded/deferred

- Windows hooks unreliable;
- hook process `PLUGIN_DATA` write `EPERM`;
- MCP process persistence not yet tested;
- omitted/all fork modes unavailable on tested tool contract;
- descendant public trace partial;
- managed-worktree target smoke deferred.

<a id="gate-00"></a>
## [GATE-00] Resolution

**PASS_WITH_AMENDMENTS → PH-01 allowed.**

No global H0 rerun.

---

<a id="ph-01"></a>
# [PH-01] Plugin Foundation + Domain Contracts — COMPLETE

**Goal:** build production foundation without persistence/orchestration complexity.

## Deliverables

<a id="deliv-01-01"></a>
### [DELIV-01.01] Single-package TypeScript baseline
Node 24, strict ESM, test/lint/build/package scripts.

<a id="deliv-01-02"></a>
### [DELIV-01.02] Minimal native plugin
Skills-only local install; PH-02 later superseded the legacy manifest with the
Agent Plugins v1 production package.

<a id="deliv-01-03"></a>
### [DELIV-01.03] Domain V1 contracts

- ProjectRef/WorkflowRun/WorkItem;
- AgentRole/AgentRuntimeProfile;
- safe default agent-profile set and future configuration contract (schema only; no exposed loader yet);
- DelegationIntent/ResolvedAgentRuntime separation;
- TaskId;
- TaskEnvelope;
- RolePayload;
- TaskDelta;
- AuthorityEnvelope;
- AcceptanceSpec/readiness;
- Evidence/Decision/ContextItem/PolicyTrace.

<a id="deliv-01-04"></a>
### [DELIV-01.04] Pure transition/completion invariants
No persistence.

<a id="deliv-01-05"></a>
### [DELIV-01.05] Foundational Skills

- orchestrate-work;
- task-envelope;
- verify-work.

State-dependent recover/status are defined in Master but activated PH-02.

<a id="deliv-01-06"></a>
### [DELIV-01.06] Compact AGENTS/document map
Permanent invariants only.

<a id="deliv-01-07"></a>
### [DELIV-01.07] Contract/package tests
Fresh install/Skill trigger/domain/property tests.

<a id="gate-01"></a>
## [GATE-01] PH-01 acceptance

PASS when:

- clean plugin install works;
- all domain/transition tests green;
- TaskEnvelope/RolePayload/TaskDelta are schema-valid and round-trip;
- foundational Skills have distinct triggers and explicit role-selection semantics;
- default profile contract maps Companion/Investigator/Verifier to Luna `xhigh` and Executor/Senior Executor to Luna `max`;
- no non-Luna subagent is enabled by default;
- direct task path needs no DB/MCP/hooks;
- no private Codex dependency;
- no PH-02 code slipped in.

**Historical next:** TP-02A then PH-02. Both are now completed/resolved; do not reopen PH-01 for later hardening unless a correctness defect is proven.

---

<a id="tp-02a"></a>
# [TP-02A] Targeted MCP Storage / Hook Re-probe — COMPLETED/RESOLVED

**Not a new phase; mandatory precondition for PH-02 storage design.**

Test on current Desktop/CLI build:

```text
stdio MCP cwd=${PLUGIN_DATA}
→ create/read/append
→ atomic rename
→ delete
→ SQLite open/transaction/reopen
→ restart persistence
```

Also run one minimal Windows hook command to determine whether previous exit/EPERM behavior changed.

### Branch

- MCP storage PASS → SQLite under plugin data.
- MCP storage FAIL → storage ADR before PH-02; no arbitrary home-dir fallback.
- Hooks FAIL → continue PH-02 with explicit MCP semantic state and no hook correctness dependency.

---

<a id="ph-02"></a>
# [PH-02] Deterministic State + MCP Substrate — COMPLETE

**Goal:** operational state whose correctness does not depend on hooks.

## Deliverables

- SQLite/state repository if TP-02A passes;
- explicit semantic transition MCP tools;
- transactional RunResourceJournal/resource projection;
- idempotency/versioning;
- mutation+audit atomicity;
- evidence/artifact metadata;
- reconciliation;
- doctor;
- optional hook telemetry adapter.

Resource journal rule: record intent before plugin-coordinated creation when possible, attach observed native resource ID immediately after creation, and never let workers rewrite shared run files directly.

## Gate
Restart/retry/duplicate command/degraded hook behavior must preserve correct state.

**Status:** COMPLETE. PH-03+ consume this substrate. Later hardening must not redesign PH-02 identity/state without a demonstrated correctness defect.

---

<a id="ph-03"></a>
# [PH-03] Context Index + Conditional Companion — CURRENT

**Goal:** provenance-aware hot context isolation and the substrate for later tri-lane context routing.

## Production subset

- read-only;
- explicit `fork_turns=none`;
- one fresh Companion per substantive run;
- lazy hydration;
- Context Delta;
- Context Index with source hash/staleness;
- project-scoped retrieval/hydration/delta ingestion with cross-project negative contracts;
- freshness derived from current source/evidence identity, never from `verifiedAt`, retrieval frequency or repeated use;
- no `agent_docs`/mandatory read-all bootstrap;
- Companion activation remains `adaptive` by default (`off|adaptive|always` is the future config/eval surface).

No economic claim yet.

---

<a id="tp-04a"></a>
# [TP-04A] Write Worker + Native Isolation Smoke

Before enabling parallel write workers:

- record exact host surface, platform and Codex version used by the probe;
- observe native wait behavior and whether unsolicited/host-forced Main re-entry occurs during a bounded wait;
- explicit fresh bounded Executor and Senior Executor;
- custom-agent role description/model/effort override behavior;
- safe fallback for unnamed/native child creation (Luna `xhigh`);
- verify Main model does not leak into named child profiles;
- workspace-write scope;
- task/result delivery;
- native managed worktree creation/transfer;
- actual changed-path validation;
- semantic conflict-zone check (migrations, lockfiles, generated schemas, central registries);
- one safe port/data collision fixture.

Failure narrows PH-04 to sequential writes.

---

<a id="ph-04"></a>
# [PH-04] Adaptive Delegation + Task Protocol

## Deliverables

- explicit direct/delegate + role-selection decision table;
- explicit working-context route: `Direct / Companion / Investigator`;
- `Direct` keeps decision-critical material with Main;
- Companion handles bulky/repeated supporting local context;
- Investigator handles one bounded unfamiliar/ambiguous evidence gap using project inspection, Internet sources, or both;
- roles: Companion, Investigator, Executor, Senior Executor, Verifier;
- versioned TOML configuration loader/resolver with built-in < user < project < session precedence;
- default Luna-only child policy: Companion/Investigator/Verifier `xhigh`, Executor/Senior `max`;
- optional explicit user mapping for `senior_executor = Sol medium` or other supported runtime, never automatic;
- no abstract `efficient/balanced/deep/critical` model tiers;
- CapabilityPreflight before substantive delegation/resource mutation;
- runtime TaskEnvelope + RolePayload + TaskDelta;
- named custom-agent profiles and explicit `fork_turns=none`;
- evidence-guided retry/escalation back to Main;
- delegated-package non-duplication policy + instrumentation;
- **DecisionBatch candidate** for independent work;
- host re-entry handling: a Main wake/re-entry without new actionable evidence does not itself cause orchestration-state mutation, duplicate spawn, routine status polling, replanning or duplicated delegated work.

Senior is selected for difficult **bounded implementation reasoning**, not merely task size. Architecture/public-contract/scope-expansion decisions remain Main-owned. Once a bounded package is delegated, Main evaluates decision-critical evidence but does not duplicate the worker's routine implementation/test/diagnostic loop unless takeover/reassignment is evidence-based.

Batch is disabled where dependency, write overlap or runtime collision exists.

No savings claim before PH-06.

---

<a id="ph-05"></a>
# [PH-05] Verification + Authority

## Deliverables

- transparent risk classes;
- risk-based verifier;
- native review integration;
- normalized evidence;
- EffectiveAuthority intersection;
- declared-vs-actual write-set validator;
- semantic conflict-zone evidence where relevant;
- completion/readiness validator.

Hook `PreToolUse` remains optional defense-in-depth only.

---

<a id="tp-06a"></a>
# [TP-06A] Eval Observer Preflight

Before A/B/C:

- capture current `codex exec --json` schema;
- determine whether Context Index orientation events and root/host re-entry can be attributed reliably from the available public trace;
- verify root token fields;
- fingerprint engineering-only ancestry parser;
- classify descendant attribution completeness;
- verify requested/effective model reporting;
- freeze memories/fast mode behavior.

---

<a id="ph-06"></a>
# [PH-06] Core A/B/C Trace Gate

### A
Stock Codex Direct.

### B
Native Codex Multi-Agent best-practice without Workflow Next semantics.

### C
Workflow Next Core.

### D optional
Latest upstream `codex_workflow` **main/release resolved and SHA-pinned at campaign freeze**. Current reference is experimental v1.1.15 / `a596daa...`.

D preflight must run package/test/runtime checks; upstream report does not define neutral measurement window.

## Campaign

```text
9-run harness validation
18-run pilot
30–36-run core campaign
selective replication
```

## Primary metrics

- correctness/acceptance;
- root tokens;
- family tokens when complete, otherwise diagnostic internal only;
- cached/uncached;
- wall time;
- retries/rework;
- human interventions;
- policy explanation.

## Orientation / coordination diagnostics

For suitable read/context-heavy tasks, measure separately when observable:

- time to first relevant evidence;
- Context Index queries/hits and bounded context injected;
- stale Context Index hits and source revalidations;
- broad repository searches;
- repeated reads of unchanged sources;
- root orchestration tokens;
- dispatch latency and coordination tool calls;
- retries/reassignments/reconciliation operations;
- duplicate routine-work incidents;
- root/host re-entry count and actionable/non-actionable split only when the observer can distinguish it reliably.

Missing/unobservable diagnostics remain unknown; they are never coerced to zero or collapsed into a scalar score.

## Targeted ablations

- Context Index `off` vs `on` on suitable read/context-heavy tasks while holding the rest of Workflow Next policy constant;
- Companion `off` vs `adaptive` vs `always`;
- tri-lane `Direct/Companion/Investigator` routing vs simpler routing;
- Verifier on/off;
- Executor Luna `xhigh` vs Luna `max`;
- hard bounded tasks: Executor profile vs Senior Executor profile while holding model constant at Luna `max`;
- optional user-approved Senior `Luna max` vs `Sol medium` experiment only when non-default-model subagents are explicitly enabled;
- TaskDelta vs full repeated packet;
- progressive context vs read-all durable docs;
- sequential vs DecisionBatch.

<a id="gate-06"></a>
## [GATE-06] Branches

**PASS:** C has no material quality regression and meaningful marginal value on target classes.  
**CONDITIONAL:** keep only winning classes/features.  
**UX_ONLY:** core B≈C but Board attention hypothesis may continue. Durable blocked.  
**FAIL:** redesign/remove core before expansion.

---

<a id="ph-07"></a>
# [PH-07] Embedded Board Beta

Entry: GATE-06 permits Core or UX-only hypothesis.

## Canonical host

```text
text/tool → inline → fullscreen
```

No sidebar V1.

## Data path

```text
render/bootstrap
→ explicit MCP read
→ component state
```

`_meta` optional optimization only.

## Evaluate

- blocker identification time;
- decision identification time;
- native thread opens avoided;
- failed-verification misses.

---

<a id="tp-08a"></a>
# [TP-08A] Runtime Isolation Preflight

Before concurrent durable writers classify:

- checkout;
- ports;
- DB/data namespace;
- services;
- temp/cache;
- credentials/test accounts.

Unknown conflicts serialize.

---

<a id="ph-08"></a>
# [PH-08] Durable Beta

Only if core evidence justifies persistence complexity.

- conditional dependency graph;
- checkpoints;
- repo/head reconciliation;
- stale context invalidation;
- unresolved decisions;
- failure fingerprints;
- D-class recovery corpus.

Stop if this requires building a standalone scheduler/container platform.

---

<a id="ph-09"></a>
# [PH-09] Calibration + Experience Promotion

- versioned corpus;
- paired uncertainty reports;
- shadow signals → calibrated thresholds → canary;
- Companion/Verifier/Board ROI;
- feature removal;
- explicit reusable Skill promotion after cross-task eval.

---

<a id="ph-10"></a>
# [PH-10] Hardening + Public V1

- threat model;
- Windows/macOS/Linux smoke;
- provenance/SBOM;
- migration/coexistence;
- install/update/remove docs;
- public benchmark methodology;
- compatibility/deprecation/rollback policy.

---

# 6. Branching Rules

<a id="br-01"></a>
## [BR-01] Host capability disappears
Use documented fallback or remove/defer feature; never reverse-engineer private host API.

<a id="br-02"></a>
## [BR-02] MCP `${PLUGIN_DATA}` remains unwritable
Architecture review storage root before PH-02.

<a id="br-03"></a>
## [BR-03] Hooks remain broken/slow
Keep best-effort telemetry only; do not block core.

<a id="br-04"></a>
## [BR-04] Fresh worker reliability regresses
Disable affected delegation path and re-probe explicit `fork_turns=none`.

<a id="br-05"></a>
## [BR-05] Companion negative ROI
Keep/raise adaptive threshold, prefer `off` for losing task classes, and do not adopt upstream mandatory-Companion behavior.

<a id="br-06"></a>
## [BR-06] Batching negative ROI
Keep sequential policy.

<a id="br-07"></a>
## [BR-07] Verifier negative ROI by risk class
Narrow verifier activation.

<a id="br-08"></a>
## [BR-08] Board duplicates native UX
Shrink to status + decision/evidence inspector.

<a id="br-09"></a>
## [BR-09] Descendant trace remains partial
No public total-token-savings claim; internal diagnostic analysis allowed.

<a id="br-10"></a>
## [BR-10] Native Codex adds equivalent feature
Benchmark then migrate/delete redundant custom layer.

---


<a id="br-11"></a>
## [BR-11] Herdr/native runtime adapter remains deferred

Do not introduce a RuntimeAdapter just because workflow-herdr exists. Only after PH-06/PH-08 evidence shows a concrete native Codex limitation may a pinned Herdr experiment be compared on quality, total tokens, latency, recovery/conflicts and observability. No measured win → no adapter.

<a id="br-12"></a>
## [BR-12] Upstream `codex_workflow` converges on our goals

Track upstream as a pinned reference. If it later gains native plugin state/evidence/recovery/config/Board capabilities equivalent to ours, benchmark `fork/adopt` versus continued independent development. Do not fork merely because prompt-level policies converge.

# 7. Roadmap Risks

<a id="rmrisk-01"></a>
## [RMRISK-01] Scope creep into orchestration platform
Guard: native primitive review.

<a id="rmrisk-02"></a>
## [RMRISK-02] Hooks regain accidental correctness ownership
Guard: explicit MCP transition tests.

<a id="rmrisk-03"></a>
## [RMRISK-03] Board becomes second scheduler
Guard: UI action contract.

<a id="rmrisk-04"></a>
## [RMRISK-04] Main-only token accounting hides family cost
Guard: completeness labels + diagnostic adapter.

<a id="rmrisk-05"></a>
## [RMRISK-05] Plus budget consumed by eval
Guard: staged campaign.

<a id="rmrisk-06"></a>
## [RMRISK-06] Invented routing precision
Guard: decision tables/shadow signals.

<a id="rmrisk-07"></a>
## [RMRISK-07] Worktree assumed full isolation
Guard: TP-08A.

<a id="rmrisk-08"></a>
## [RMRISK-08] Skills/AGENTS bloat
Guard: compactness/trigger tests.

<a id="rmrisk-09"></a>
## [RMRISK-09] Companion stale memory
Guard: fresh run + fingerprints.

<a id="rmrisk-10"></a>
## [RMRISK-10] Experimental upstream copied as authority
Guard: clean-room + our evals.

<a id="rmrisk-11"></a>
## [RMRISK-11] Private diagnostic parser leaks into product
Guard: dependency test/package boundary.

<a id="rmrisk-12"></a>
## [RMRISK-12] False readiness/completion
Guard: readiness levels and target evidence.

<a id="rmrisk-13"></a>
## [RMRISK-13] Model availability changes on Plus
Guard: named roles + versioned runtime mapping + compatibility refresh.

<a id="rmrisk-14"></a>
## [RMRISK-14] Old docs/amendments conflict
Guard: current canonical Master + Roadmap are normative replacements.

<a id="rmrisk-15"></a>
## [RMRISK-15] Preflight becomes mandatory ceremony
Guard: only substantive mutation paths; direct fast path bypasses it.

<a id="rmrisk-16"></a>
## [RMRISK-16] Resource journal becomes a scheduler
Guard: journal records intent/observed native resources; Codex owns lifecycle.

<a id="rmrisk-17"></a>
## [RMRISK-17] Project configuration contains dead policy keys
Guard: typed versioned schema and behavior-changing tests for every setting.

<a id="rmrisk-18"></a>
## [RMRISK-18] Durable artifacts regrow into docs ceremony
Guard: no docs role/stage; only artifacts with explicit source-of-truth/evidence/release consumers.

<a id="rmrisk-19"></a>
## [RMRISK-19] Main model leaks into expensive child agents
Guard: named custom-agent runtime mappings, Luna `xhigh` global fallback, safe default allowlist and TP-04A verification. No implicit inheritance is accepted for Workflow Next-managed workers.

<a id="rmrisk-20"></a>
## [RMRISK-20] Senior becomes a second uncontrolled Main
Guard: Senior owns only difficult bounded implementation reasoning; project architecture, public contracts, scope expansion and final acceptance remain Main-owned.

---

# 8. Per-phase Detailed Plan Contract

Each phase plan must contain:

1. exact scope/non-goals;
2. current compatibility recheck;
3. exact file map;
4. schemas/interfaces;
5. task decomposition;
6. tests first for deterministic code;
7. live host smoke where needed;
8. migration/rollback;
9. telemetry/evidence;
10. security/provenance;
11. phase gate checklist.

Current plan: `CODEX_WORKFLOW_PH03_IMPLEMENTATION_PLAN.md`.

---

# 9. Executive Summary

```text
PH-00  COMPLETE / PASS_WITH_AMENDMENTS
          ↓
PH-01  FOUNDATION                         COMPLETE
          ↓
TP-02A  MCP STORAGE RE-PROBE               COMPLETE/RESOLVED
          ↓
PH-02  STATE + MCP                         COMPLETE
          ↓
PH-03  CONTEXT COMPANION                   NOW
          ↓
TP-04A  WRITE/WORKTREE SMOKE
          ↓
PH-04  TASK PROTOCOL + ADAPTIVE DELEGATION + BATCH CANDIDATE
          ↓
PH-05  VERIFICATION + AUTHORITY
          ↓
TP-06A TRACE PREFLIGHT
          ↓
PH-06  A/B/C CORE VALUE GATE
          ↓
PH-07  BOARD (if justified)
          ↓
TP-08A RUNTIME ISOLATION
          ↓
PH-08  DURABLE (if justified)
          ↓
PH-09  CALIBRATE
          ↓
PH-10  PUBLIC V1
```
