# Workflow Next — PH-00 / H0 Detailed Capability-Proof Plan

> **Status:** implementation-ready capability spike baseline  
> **Date baseline:** 2026-09-03  
> **Roadmap:** `PH-00`, `DELIV-00.01..00.07`, `GATE-00`, `PLANSEED-00`  
> **Master Plan:** `MILE-00`, `WP-001..WP-009`, `AC-10`  
> **Product:** Desktop-first Codex workflow plugin; CLI-compatible; no standalone app/runtime  
> **Execution class:** feasibility/capability proof. Throwaway probe code is expected. Production domain/state/orchestration code is explicitly out of scope.

---

<a id="h0-idx"></a>
## [H0-IDX] Index

| Area | IDs |
|---|---|
| Purpose / rules | `H0-01..H0-09` |
| Baseline / assumptions | `BASE-01..BASE-10` |
| Evidence protocol | `EVD-01..EVD-12` |
| Probe 0 — environment | `P00-*` |
| Probe 1 — provenance | `P01-*` |
| Probe 2 — plugin package | `P02-*` |
| Probe 3 — Skills | `P03-*` |
| Probe 4 — MCP data/tool contract | `P04-*` |
| Probe 5 — embedded UI | `P05-*` |
| Probe 6 — Hooks / PLUGIN_DATA | `P06-*` |
| Probe 7 — native subagents/context/model routing | `P07-*` |
| Probe 8 — native Desktop dev surfaces | `P08-*` |
| Probe 9 — CLI parity / continuity | `P09-*` |
| Probe 10 — trace/usage attribution | `P10-*` |
| Probe 11 — memories / compaction | `P11-*` |
| Probe 12 — sidebar/workbench public API | `P12-*` |
| Probe 13 — degraded/security behavior | `P13-*` |
| Consolidation / decisions | `P14-*` |
| Gate | `GATE-H0-*` |
| Branches | `BR-H0-*` |
| Deliverables | `OUT-H0-*` |
| Follow-up impact | `NEXT-*` |
| Sources | `H0-SRC-*` |

---

# 1. Purpose and architectural role

<a id="h0-01"></a>
## [H0-01] H0 proves the host, not the product

H0 exists to remove platform uncertainty before any production implementation of Workflow Next. It must answer which public Codex Desktop/CLI extension points are **actually usable on the user's current ChatGPT Plus installation**, not which APIs appear plausible from documentation.

The phase is successful even when a desired capability is absent, provided the absence is recorded and a safe fallback is selected.

**H0 must not optimize the workflow, implement the Board, build SQLite domain state, or prove token savings.** Those belong to later phases.

Master links: `GOAL-01`, `GOAL-04`, `MILE-00`, `AC-10`.  
Roadmap links: `PH-00`, `SPEC-00.01..00.03`, `GATE-00`.

<a id="h0-02"></a>
## [H0-02] Native primitive first is a testable rule

For every future Workflow Next capability, H0 classifies the relevant Codex surface as:

```text
PUBLIC_CONFIRMED      documented and reproduced
PUBLIC_DEGRADED       documented but incomplete/host-specific
PUBLIC_UNAVAILABLE    documented elsewhere but absent on target host/account
UNDOCUMENTED          observed or suspected, but no public contract
UNSUPPORTED_PUBLIC    no supported public extension point found
```

Only `PUBLIC_CONFIRMED` and deliberately handled `PUBLIC_DEGRADED` capabilities may become production dependencies.

`UNDOCUMENTED` behavior can be recorded as evidence but **must not** become a V1 dependency.

<a id="h0-03"></a>
## [H0-03] The highest-risk assumption is subagent context isolation

Workflow Next's economic architecture assumes:

```text
Main keeps intent/decisions
→ Task Capsule gives bounded context
→ worker absorbs operational noise in a separate thread
```

The existence of a separate thread does **not by itself prove** bounded model context. H0 must determine, on the current native multi-agent surface:

1. what context a child receives by default;
2. whether a public API/configuration can request fresh/bounded child context;
3. whether role/model/reasoning overrides work with that mode;
4. whether Desktop and CLI expose enough evidence to distinguish the cases;
5. what token cost the alternatives produce on a controlled synthetic fixture.

If fresh/bounded child context cannot be requested through a public supported surface, `Task Capsule → cheap isolated worker` remains a conceptual pattern but cannot be treated as a guaranteed token-saving primitive until Codex exposes it.

This probe is **more architecturally important than sidebar UI**.

<a id="h0-04"></a>
## [H0-04] Desktop is the primary UX; CLI is a compatibility/control surface

H0 must prove:

- local plugin installation/use in ChatGPT Desktop Codex;
- the same plugin's Skills/MCP availability in Codex CLI where supported;
- native CLI agent/status controls sufficient to avoid a custom TUI;
- no production design requires the user to leave normal Codex chat.

No separate CLI product is allowed to emerge from the spike.

<a id="h0-05"></a>
## [H0-05] UI is optional presentation over useful MCP tools

The MCP tool layer must remain useful if the host does not render UI. The spike therefore tests data/tool semantics first and rendering second.

Preferred presentation ladder:

```text
inline status card
→ fullscreen when more space is needed
→ optional PiP for ongoing status
→ optional modal for a decision
```

Sidebar/workbench is a bonus capability only if a third-party public contract exists.

<a id="h0-06"></a>
## [H0-06] Hooks are event and policy integration, not an agent runtime

H0 validates Hooks for:

- lifecycle observation;
- deterministic lightweight persistence to `PLUGIN_DATA`;
- future tool-policy enforcement feasibility;
- degraded operation when hooks are untrusted/disabled.

H0 must not build an orchestration loop in a hook.

<a id="h0-07"></a>
## [H0-07] Plus/account reality must be captured, not assumed

The target deployment is the user's ChatGPT Plus account. H0 records the actual model picker/config capabilities available in Codex Desktop and CLI on the test date.

Do not infer available reasoning levels from API documentation or standard ChatGPT chat. On Plus, Codex currently exposes GPT-5.6 Sol/Terra/Luna according to OpenAI's plan documentation, but exact per-surface reasoning modes and model-routing behavior must be observed live.

<a id="h0-08"></a>
## [H0-08] No private Codex internals as a production dependency

Forbidden:

- Electron bundle patching;
- scraping private Desktop IPC;
- reading `$CODEX_HOME/worktrees` to control worktrees;
- parsing private UI state;
- depending on undocumented rollout/session formats for production behavior;
- hidden `spawn_agent` arguments not present in the public runtime/schema;
- using first-party Security workbench internals as a third-party API.

Private/local traces may be examined **only as diagnostic evidence during H0**, explicitly marked non-contractual, and never required for production correctness.

<a id="h0-09"></a>
## [H0-09] H0 completion is evidence-driven

Every capability receives:

```text
claim
public source
exact test
observed result
evidence artifact
classification
architectural consequence
```

No capability is accepted because “Codex probably supports it.”

---

# 2. Current official baseline to validate live

<a id="base-01"></a>
## [BASE-01] Current CLI reference version

As of 2026-09-03, the public changelog lists **Codex CLI 0.152.0** on 2026-09-01. H0 should update to the latest stable available at execution time, then record the exact installed version; do not hard-code 0.152.0 as a permanent minimum.

<a id="base-02"></a>
## [BASE-02] Codex is integrated into ChatGPT Desktop

Codex is available in the ChatGPT desktop app on macOS and Windows. The current product surface already owns projects/chats, native parallel agents, Git/worktrees, review and terminal UX. Therefore H0 tests coexistence rather than recreating these capabilities.

<a id="base-03"></a>
## [BASE-03] Codex-native plugin packaging

The documented Codex plugin package uses:

```text
.codex-plugin/plugin.json      required
skills/                        optional
.app.json                      optional
.mcp.json                      optional
assets/                        optional
hooks/...                      supported by Codex plugin hooks documentation
```

Local plugin development is supported via local marketplaces and `@plugin-creator` / `$plugin-creator`.

<a id="base-04"></a>
## [BASE-04] Plugin use differs by host/plan

The universal plugin directory spans ChatGPT/Codex, but feature availability depends on product surface, plan, role and plugin capabilities. Plugins declaring MCP servers may be marked Desktop-only. H0 therefore tests **local Codex plugin behavior on the user's Plus account**, not generic ChatGPT plugin availability.

<a id="base-05"></a>
## [BASE-05] Hooks have explicit trust semantics

Codex plugin hooks are skipped until the user reviews/trusts the current hook definition. Plugin hook commands receive `PLUGIN_ROOT` and writable `PLUGIN_DATA`. `command` and `mcp_tool` handlers are supported; parsed `prompt`/`agent` handlers are not executed. This means our future architecture may use hooks for deterministic events/policy, but not as a hidden LLM lifecycle engine.

<a id="base-06"></a>
## [BASE-06] Worktrees are already a Desktop primitive

Codex-managed local worktrees provide checkout isolation and support `.worktreeinclude` for selected ignored local files. Local environment setup scripts can initialize dependencies when a new worktree starts. This confirms that future Workflow Next policy should decide **when isolation is useful**, while Codex retains worktree lifecycle ownership.

<a id="base-07"></a>
## [BASE-07] Review and terminal are already native

Desktop has a review pane and integrated terminal; `/review` launches a dedicated review workflow without modifying the working tree. Future Workflow Next verification should call/guide native review and collect evidence, not implement a diff viewer or shell terminal.

<a id="base-08"></a>
## [BASE-08] CLI already has agent and plugin controls

Current CLI exposes plugin browsing and native agent controls. Recent releases added an interactive `codex agents` dashboard, `codex queue`, and improved `codex doctor`. H0 checks whether these already cover the CLI observability/control needs that an earlier plan might have assigned to a custom CLI Board.

<a id="base-09"></a>
## [BASE-09] Controlled trace surface exists

`codex exec --json` provides JSONL events and reports token usage on completed turns. H0 validates the exact current schema and whether it is sufficient for later A/B/C harness evaluation without App Server or private rollout parsing.

<a id="base-10"></a>
## [BASE-10] GPT-5.6 model family is the current target

Official model guidance positions:

- Sol: complex/open-ended/high-value work;
- Terra: balanced, strong read-heavy/subagent work;
- Luna: clear, repetitive/high-volume work.

On Plus, Codex supports Sol, Terra and Luna according to current plan documentation. H0 does **not** freeze these mappings; it records actual selectable models/efforts and tests explicit child profile selection.

---

# 3. H0 repository and execution isolation

<a id="evd-01"></a>
## [EVD-01] Use a dedicated spike branch

Recommended:

```text
spike/ph00-codex-capabilities
```

No PH-00 experimental file is merged into the future production plugin unless it is deliberately rewritten/reviewed in PH-01.

<a id="evd-02"></a>
## [EVD-02] Probe directory

Use an isolated directory so spike artifacts are easy to delete:

```text
spikes/ph00/
├── README.md
├── fixture-plugin/
│   ├── .codex-plugin/plugin.json
│   ├── skills/ph00-status/SKILL.md
│   ├── .mcp.json
│   ├── hooks/hooks.json
│   ├── src/
│   │   ├── mcp-server.ts
│   │   └── hook-recorder.ts
│   └── ui/
│       └── capability-card.tsx
├── fixtures/
│   ├── subagent-context/
│   ├── worktree-env/
│   └── trace-usage/
└── evidence/
    └── .gitkeep
```

The exact scaffold may be adapted by Codex's current `plugin-creator`, but the separation between throwaway spike and future `src/` remains mandatory.

<a id="evd-03"></a>
## [EVD-03] Durable PH-00 documents

Only these are intended to survive the spike:

```text
PROVENANCE.md
docs/compatibility.md
docs/ph00-capability-report.md
docs/adr/ADR-PH00-001-board-host.md
docs/adr/ADR-PH00-002-subagent-context.md
docs/adr/ADR-PH00-003-trace-attribution.md
```

Optionally add an ADR only when the live evidence actually changes the architectural choice.

<a id="evd-04"></a>
## [EVD-04] Evidence naming

Every probe result is captured as:

```text
spikes/ph00/evidence/<probe-id>/<timestamp>-<surface>-<artifact>
```

Examples:

```text
P05/20260903-desktop-inline.png
P06/20260903-desktop-hook-sessionstart.json
P07/20260903-cli-subagent-context-a.jsonl
P10/20260903-cli-exec-usage.jsonl
```

<a id="evd-05"></a>
## [EVD-05] Evidence types

Accepted evidence:

- exact command + stdout/stderr;
- screenshot for Desktop-only visual behavior;
- generated JSON/JSONL fixture;
- file-system artifact produced by a documented hook/tool;
- exact config before/after;
- public documentation citation;
- controlled Git diff.

A prose statement without evidence is not sufficient for a `PUBLIC_CONFIRMED` classification.

<a id="evd-06"></a>
## [EVD-06] Secret hygiene

Use a synthetic/local test repository and dummy environment values. Never include real secrets in screenshots, shared thread snapshots, plugin `_meta`, logs, `.worktreeinclude`, or evidence artifacts.

<a id="evd-07"></a>
## [EVD-07] Environment fingerprint

At spike start record:

```text
OS + build
ChatGPT Desktop version/build
Codex CLI version
Node version
Git version
Plus authentication status
current models visible in Desktop
current models visible in CLI
reasoning levels visible per model
feature flags relevant to agents/plugins/hooks if publicly visible
```

<a id="evd-08"></a>
## [EVD-08] Each live test starts from an explicit state

For each probe record:

```text
new or resumed chat
local/worktree/CLI surface
plugin installed/enabled
hooks trusted/untrusted
model + reasoning level
sandbox/approval mode
repo HEAD
```

<a id="evd-09"></a>
## [EVD-09] No benchmark claims in H0

A small subagent context/token test is allowed to validate semantics, but H0 does not claim product savings. Full A/B/C belongs to PH-06.

<a id="evd-10"></a>
## [EVD-10] Prefer public machine-readable surfaces

Evidence priority:

```text
public JSON/schema/API
> public CLI output
> visible Desktop behavior
> diagnostic local trace
```

Private local session internals can explain discrepancies but cannot raise a capability to `PUBLIC_CONFIRMED`.

<a id="evd-11"></a>
## [EVD-11] Feature-detect UI extensions

Do not branch on “ChatGPT vs Codex” by host name. Where possible, test the capability itself (`requestDisplayMode`, `requestModal`, etc.) and record the fallback.

<a id="evd-12"></a>
## [EVD-12] Time-box unsupported public API research

If public docs/search reveal no third-party API for a desired surface, classify it and move on. H0 must not become a reverse-engineering project.

---

# 4. Probe sequence

# Probe 0 — Environment and version baseline

<a id="p00-01"></a>
## [P00-01] Update and record supported clients

Actions:

1. Update ChatGPT Desktop to latest stable available through normal product update.
2. Update Codex CLI through the official package channel.
3. Record exact versions using the product's About/version UI and `codex --version`.
4. Record the current public changelog version for comparison.

Expected current reference: CLI 0.152.0 as of 2026-09-01, but live installed value wins.

<a id="p00-02"></a>
## [P00-02] Capture Plus model surface

In Desktop Codex and CLI separately record:

- selectable Sol/Terra/Luna;
- available reasoning levels;
- whether Ultra exists on Plus for the selected surface;
- default model/effort;
- model switching behavior.

Do not modify global defaults yet.

<a id="p00-03"></a>
## [P00-03] Capture native command/capability surface

CLI:

```text
/plugins
/hooks
/agent or /subagents
codex agents
codex queue --help
codex doctor
```

Desktop:

- Plugins manager;
- Codex project/chat;
- worktree selector;
- review pane;
- integrated terminal;
- local environment settings;
- memories control if present.

**Output:** `docs/compatibility.md` baseline rows.

---

# Probe 1 — Provenance / clean-room baseline

<a id="p01-01"></a>
## [P01-01] Freeze referenced upstreams

Record the exact URLs/ref/commit dates for:

- `viettran-edgeAI/codex_workflow` main and `experiment/beta-install-prompt`;
- reviewed forks used as architectural references;
- OpenAI docs/changelog pages used by H0.

<a id="p01-02"></a>
## [P01-02] License classification

For every non-OpenAI code repository from which code might be reused classify:

```text
code_reuse_allowed
ideas_only
unknown_do_not_copy
```

`codex_workflow` remains ideas-only unless a compatible license grant is independently confirmed.

<a id="p01-03"></a>
## [P01-03] Create `PROVENANCE.md`

Record the clean-room rule:

> architectural concepts may be independently implemented; upstream prompt/code text is not copied into Workflow Next without explicit compatible licensing.

---

# Probe 2 — Minimal Codex-native plugin package

<a id="p02-01"></a>
## [P02-01] Scaffold using the current supported route

Prefer the built-in plugin creator if it is available in the current Codex surface; otherwise create the documented minimal structure manually.

Minimum fixture:

```text
.codex-plugin/plugin.json
skills/ph00-status/SKILL.md
.mcp.json
```

No production naming or APIs yet.

<a id="p02-02"></a>
## [P02-02] Local marketplace installation

Prove, with a new Desktop Codex chat after installation:

- local plugin is discoverable;
- plugin installs/enables;
- its Skill/tool appears in the supported source/plugin surface;
- uninstall/disable works cleanly.

<a id="p02-03"></a>
## [P02-03] CLI visibility

Start a **new CLI session** and verify the same local plugin is visible through the documented plugin browser/marketplace path.

Classify differences between Desktop and CLI rather than attempting to normalize them in code.

<a id="p02-04"></a>
## [P02-04] Desktop-only classification behavior

If `.mcp.json` causes the local plugin to be labeled Desktop-only or otherwise limits surfaces, record the exact behavior. Do not infer that a public universal directory plugin will behave identically.

**Pass:** a supported local plugin package works in Desktop Codex and its non-UI capability is usable in CLI where documented.

---

# Probe 3 — Skills and progressive loading

<a id="p03-01"></a>
## [P03-01] Minimal triggerable Skill

Skill purpose: return a fixed PH-00 status sentence and reference a small on-demand file.

Test prompts:

```text
show PH-00 capability status          -> should trigger
what is 2+2                           -> should not trigger
inspect current workflow spike        -> should trigger or be intentionally ambiguous
```

<a id="p03-02"></a>
## [P03-02] New-chat activation behavior

After installation/update:

- verify whether an existing chat sees the changed Skill;
- verify a new chat sees it;
- record whether restart is required.

Production planning will follow the observed lifecycle, not assumption.

<a id="p03-03"></a>
## [P03-03] Progressive disclosure sanity check

Create:

```text
SKILL.md
references/details.md
scripts/noop.*
```

Verify the Skill can use the reference/script only when the task requires it. Do not attempt to inspect hidden model context; evidence may be behavioral/tool-access based.

<a id="p03-04"></a>
## [P03-04] Desktop vs CLI Skill parity

Run the same trigger/non-trigger smoke prompts in both surfaces.

**Architecture consequence:** if packaged Skills are reliable, Workflow Next keeps permanent `AGENTS.md` small and moves procedures into Skills. If not, PH-01 must define a degraded instructions strategy.

---

# Probe 4 — MCP data/tool contract before UI

<a id="p04-01"></a>
## [P04-01] Read-only capability tool

Implement one deterministic MCP tool:

```text
ph00_get_status()
```

Return:

```json
{
  "phase": "PH-00",
  "status": "probe",
  "counter": 1
}
```

Use explicit output schema and read-only annotation.

<a id="p04-02"></a>
## [P04-02] Verify model/tool behavior without UI

Desktop and CLI must be able to use the tool and receive meaningful data without any component attached.

This is a mandatory prerequisite for Board architecture.

<a id="p04-03"></a>
## [P04-03] Tool annotations and authorization semantics

Verify how Codex presents read-only annotations and approvals. Record that annotations are UX hints and server-side/runtime enforcement remains our responsibility for future mutation tools.

<a id="p04-04"></a>
## [P04-04] MCP lifecycle

Record:

- server startup behavior;
- errors if unavailable;
- restart/reconnect behavior;
- CLI/desktop differences;
- whether a plugin can remain useful with its MCP server unavailable.

---

# Probe 5 — Embedded UI and Board-host feasibility

<a id="p05-01"></a>
## [P05-01] Inline component

Attach a minimal component to a dedicated render tool, not the data tool.

Required proof:

- component renders in target Desktop Codex host;
- tool remains functional without component rendering;
- UI receives `structuredContent`.

If custom UI is documented generically but not rendered in Codex Desktop, classify `PUBLIC_UNAVAILABLE` on the target host and do not force a workaround.

<a id="p05-02"></a>
## [P05-02] `_meta` isolation

Return two distinct values:

```text
structuredContent.visible_to_model = PH00_PUBLIC_NONCE
_meta.ui_only_secret_test = PH00_UI_NONCE
```

Prove the component receives the UI nonce while the conversation/model-visible result only exposes the public value. Never use real secrets.

This test validates our future token-saving Board hydration strategy.

<a id="p05-03"></a>
## [P05-03] UI → MCP tool call

From the component, trigger a read-only MCP call using the standard MCP Apps bridge where supported.

Record whether this is available in the actual Codex host.

<a id="p05-04"></a>
## [P05-04] UI → follow-up chat message

Trigger a follow-up message from the component using the shared/compatible host bridge.

Target use case later:

```text
Discuss DEC-017 in chat
```

<a id="p05-05"></a>
## [P05-05] Fullscreen

Feature-detect display mode support and request fullscreen.

Record:

- success/failure;
- whether composer remains available;
- whether state survives mode transition;
- narrow-window behavior.

<a id="p05-06"></a>
## [P05-06] PiP

Feature-detect and request picture-in-picture.

Classification can be `PUBLIC_DEGRADED` if the host maps it differently or does not expose it.

PiP is not a gate requirement.

<a id="p05-07"></a>
## [P05-07] Modal

Feature-detect host-controlled modal support. Use only a synthetic decision card.

Modal is optional; fallback is inline/fullscreen.

<a id="p05-08"></a>
## [P05-08] Decoupled data/render architecture

Demonstrate the recommended pattern:

```text
data tool
→ model gets compact structured data
→ render tool
→ UI gets richer presentation data
```

Record the behavior that will later guide Board MCP design.

**Critical output:** `ADR-PH00-001-board-host.md` selects the supported V1 presentation ladder.

---

# Probe 6 — Hooks, trust, Windows behavior and PLUGIN_DATA

<a id="p06-01"></a>
## [P06-01] Trust gate

Install/enable a plugin containing a harmless hook.

Verify:

1. hook is skipped before explicit trust;
2. plugin Skill/MCP capability still has a usable degraded path;
3. after trust, hook runs.

This proves hooks cannot be a correctness dependency for the direct fast path.

<a id="p06-02"></a>
## [P06-02] PLUGIN_ROOT / PLUGIN_DATA

Hook writes a single line containing a synthetic event ID into:

```text
$PLUGIN_DATA/ph00-events.jsonl
```

Verify writable persistence across a chat restart and identify lifecycle/cleanup behavior.

<a id="p06-03"></a>
## [P06-03] Lifecycle event matrix

Where documented/available, capture at least one fixture for:

```text
SessionStart(startup)
SessionStart(resume)
SessionStart(compact) or PreCompact/PostCompact where exposed
SubagentStart
SubagentStop
PreToolUse
PostToolUse
Stop
SessionEnd
```

Do not invent unsupported events. `docs/compatibility.md` records exact observed availability.

<a id="p06-04"></a>
## [P06-04] Synchronous policy proof

Use `PreToolUse` on a harmless synthetic command/path to demonstrate whether a future Workflow Next authority rule can block or narrow an observable tool operation.

Do not implement general shell parsing.

<a id="p06-05"></a>
## [P06-05] Async semantics

Verify an async hook cannot block/control the triggering operation. This becomes a future rule: telemetry hooks may be async; authority enforcement must be synchronous.

<a id="p06-06"></a>
## [P06-06] Windows command path

Because Desktop target includes Windows, prove the documented Windows command override/path mechanism works or document the tested alternative. Avoid a Python-only runtime requirement.

**Architecture consequence:** PH-02 can use hooks as an event source only for events proven here; missing events require explicit MCP/state updates or a degraded projection.

---

# Probe 7 — Native subagents, custom profiles and context semantics

<a id="p07-01"></a>
## [P07-01] Custom agent configuration

Create three temporary project-scoped profiles:

```text
ph00-reader    read-only
ph00-worker    bounded write or safe fixture
ph00-reviewer  read-only
```

Set explicit model/reasoning only to values confirmed available on the user's Plus account.

Verify Desktop and CLI surface the role/thread identity.

<a id="p07-02"></a>
## [P07-02] Default inheritance

From a fresh short parent chat, spawn a child without explicit model/effort override where the supported UI/tool permits it.

Record the displayed/effective model and effort through public UI/config evidence.

<a id="p07-03"></a>
## [P07-03] Explicit model/effort override

Spawn a fresh child using the documented custom-agent mechanism and verify the requested profile takes effect.

If the public spawn schema exposes model/effort/fork controls, capture them verbatim as evidence. If it does not, do not rely on hidden runtime arguments.

<a id="p07-04"></a>
## [P07-04] Context inheritance synthetic test — critical

Create a parent thread with a unique synthetic nonce early in history, then later ask the parent to delegate a worker whose self-contained Task Capsule does **not** contain that nonce.

Child task:

```text
Return whether PH00_PARENT_NONCE_<random> is present in your available task/context.
Do not search files or the network.
```

Run at least:

- default native spawn behavior;
- any publicly documented/configurable bounded/fresh context mode, if available;
- custom-agent profile path.

Record results and token usage where public telemetry allows.

Do not treat model self-report alone as definitive. Corroborate with public spawn parameters and trace differences when possible.

<a id="p07-05"></a>
## [P07-05] Long-parent amplification micro-test

Purpose: detect whether a long parent makes child startup dramatically more expensive.

Fixture:

1. short parent → one identical read-only child;
2. deliberately longer synthetic parent → same child task;
3. compare child/root usage through public trace surfaces where attributable.

This is a **semantic risk probe**, not the PH-06 benchmark.

<a id="p07-06"></a>
## [P07-06] Child result delivery reliability

Run a bounded read-only child task several times and verify:

- result reaches parent;
- parent can distinguish success/failure/timeout;
- no unbounded wait loop is needed;
- thread remains inspectable through native Desktop/CLI controls.

Recent MultiAgentV2 reports justify testing this explicitly.

<a id="p07-07"></a>
## [P07-07] Nested delegation boundary

Observe whether a child can spawn descendants by default. Do not rely on hidden max-depth behavior. The future V1 policy should prefer Main-owned delegation unless a supported native boundary can enforce otherwise.

<a id="p07-08"></a>
## [P07-08] User steering and thread access

Test:

- opening child thread in Desktop;
- `/agent`, `/subagents` or `codex agents` inspection in CLI;
- whether the user can directly continue/steer a running/completed child on the current v2 surface;
- whether only the parent can route follow-ups.

This determines what Board actions may safely promise later.

<a id="p07-09"></a>
## [P07-09] Subagent MCP inheritance

Using a harmless optional MCP server, determine whether children inherit/start the parent's MCP surface and whether profile-specific configuration can narrow it publicly.

This affects both startup cost and authority design.

**Critical output:** `ADR-PH00-002-subagent-context.md` chooses one of:

```text
A. PUBLIC_BOUNDED_CONTEXT_AVAILABLE
B. PUBLIC_CONTEXT_CONTROL_PARTIAL
C. PUBLIC_BOUNDED_CONTEXT_UNAVAILABLE
```

If C, Task Capsule remains a semantic instruction boundary but not a guaranteed context-size boundary; PH-03/04 must be redesigned accordingly before implementation.

---

# Probe 8 — Native Desktop worktree/review/terminal/local-environment coverage

<a id="p08-01"></a>
## [P08-01] Local → managed worktree workflow

Create a synthetic change in a disposable fixture and test the supported Local/Worktree flow.

Record:

- checkout state;
- branch/detached HEAD semantics;
- transfer/handoff behavior;
- what native UI shows.

<a id="p08-02"></a>
## [P08-02] `.worktreeinclude`

Fixture contains a dummy ignored non-secret config file. Verify the documented inclusion behavior for Desktop-managed local worktrees.

Do not include real `.env` secrets.

<a id="p08-03"></a>
## [P08-03] Local environment setup

Configure a minimal setup action for the fixture. Verify it runs on new Desktop-managed worktree creation and record platform-specific behavior.

<a id="p08-04"></a>
## [P08-04] Runtime collision test

Demonstrate that checkout isolation does not automatically prove port/database/service isolation by running a synthetic fixed-port service or equivalent harmless fixture.

Outcome is documentation, not a custom workspace manager.

This creates the requirement for future `RuntimeIsolationProfile`.

<a id="p08-05"></a>
## [P08-05] Native review

Run `/review` or the Desktop review flow on a synthetic diff.

Verify:

- dedicated reviewer behavior;
- no production mutation by review itself;
- review pane contains sufficient diff UX;
- Workflow Next should not build its own diff viewer.

<a id="p08-06"></a>
## [P08-06] Integrated terminal

Verify terminal is scoped to current project/worktree and Codex can reference current output. Confirm no custom terminal is needed.

**Output:** capability matrix rows for worktree/review/terminal/local environment.

---

# Probe 9 — CLI parity and cross-surface control

<a id="p09-01"></a>
## [P09-01] Plugin/Skill/MCP parity

Repeat minimal P02–P04 behavior in CLI.

UI rendering is not required. Data tools/status must remain useful.

<a id="p09-02"></a>
## [P09-02] Native agent dashboard

Test current `codex agents` and `/agent`/`/subagents` capabilities:

- list;
- open/inspect;
- rename if supported;
- stop if supported;
- distinguish main vs child threads.

Document which future custom CLI Board requirements are already obsolete.

<a id="p09-03"></a>
## [P09-03] Queue / session messaging

Test `codex queue` only as a capability discovery probe. Do not make Workflow Next depend on it in V1 unless a later requirement needs cross-session messaging.

<a id="p09-04"></a>
## [P09-04] Doctor integration boundary

Capture what current `codex doctor` already diagnoses. Future `workflow-doctor` must only cover plugin-specific state and must not duplicate Codex's own endpoint/network/Desktop/update checks.

<a id="p09-05"></a>
## [P09-05] Desktop/CLI configuration consistency

Record which configuration is shared and which is surface-specific:

- plugins;
- agents;
- hooks trust;
- models;
- local environments;
- memories.

---

# Probe 10 — Trace and usage surface

<a id="p10-01"></a>
## [P10-01] `codex exec --json` schema capture

Run a minimal deterministic task under ChatGPT subscription auth:

```text
Reply exactly: PH00_OK
```

Capture raw JSONL.

Required fields/classification:

```text
thread.started
turn.started
item.*
turn.completed
usage.input_tokens
usage.cached_input_tokens
usage.output_tokens
usage.reasoning_output_tokens  if current documented build emits it
```

Never synthesize a missing field as zero.

<a id="p10-02"></a>
## [P10-02] Requested/effective model attribution

Record whether the public JSONL reports effective provider model ID. If not, classify model attribution as `configured/requested`, not provider-confirmed.

<a id="p10-03"></a>
## [P10-03] Interrupted/failed turn accounting

Test a safe controlled interruption or failure. Determine whether token usage is available for incomplete turns. Missing usage must become a later `partial` telemetry condition rather than silently zero.

<a id="p10-04"></a>
## [P10-04] Subagent descendant attribution

Run a minimal parent + child task through the most automation-friendly public surface available.

Determine whether public trace events provide:

- child thread ID;
- parent relationship;
- child usage;
- role/model;
- timing.

Classify:

```text
COMPLETE
PARTIAL
UNAVAILABLE
```

<a id="p10-05"></a>
## [P10-05] Diagnostic cross-check without production dependency

If public attribution is incomplete, diagnostic local Codex state/rollout may be inspected manually to understand the gap, but the report must label it `NON_CONTRACTUAL_DIAGNOSTIC`.

No future total-token claim may depend solely on this private format.

<a id="p10-06"></a>
## [P10-06] Cached-token semantics

Confirm the current schema interpretation:

```text
cached_input_tokens is a subset of input_tokens
```

The later normalizer must not add cached input to total input again.

**Critical output:** `ADR-PH00-003-trace-attribution.md` and `SPEC-00.03` classification.

---

# Probe 11 — Memories and compaction

<a id="p11-01"></a>
## [P11-01] Memories-off viability

Turn native memories off using supported controls where available and prove the plugin/spike works.

Workflow correctness must never depend on ambient memory.

<a id="p11-02"></a>
## [P11-02] Memory presence behavior

With memories enabled, record only visible supported behavior. Do not parse memory filesystem internals.

<a id="p11-03"></a>
## [P11-03] Compaction hook behavior

Trigger or observe a safe compaction path if feasible and verify relevant lifecycle hook behavior, especially whether `SessionStart(source=compact)` or other documented compaction events can re-inject a small deterministic recovery hint.

This is a capability proof, not recovery implementation.

---

# Probe 12 — Public sidebar/workbench extension

<a id="p12-01"></a>
## [P12-01] Documentation search

Search only public OpenAI plugin/Codex extension documentation for a third-party API to add a persistent sidebar/workbench entry comparable to Codex Security.

<a id="p12-02"></a>
## [P12-02] Classification

Choose exactly one:

```text
SUPPORTED_PUBLIC
UNSUPPORTED_PUBLIC
UNKNOWN_NOT_USED
```

`SUPPORTED_PUBLIC` requires an actual public contract and a throwaway proof.

Seeing Codex Security in the sidebar is not sufficient evidence.

<a id="p12-03"></a>
## [P12-03] Stop condition

If no public contract is documented, stop. Do not inspect proprietary Desktop bundles or internal first-party plugin code.

Expected V1 fallback:

```text
inline card → fullscreen
```

---

# Probe 13 — Degraded behavior, permissions and cleanup

<a id="p13-01"></a>
## [P13-01] Plugin disabled

Disable the plugin and verify ordinary Codex behavior remains normal.

<a id="p13-02"></a>
## [P13-02] MCP unavailable

Break the fixture MCP server intentionally and verify Skills/ordinary Codex tasks fail gracefully rather than blocking the entire Codex session.

<a id="p13-03"></a>
## [P13-03] Hooks untrusted

Run the basic status workflow without trusting hooks. The direct user workflow must remain usable.

<a id="p13-04"></a>
## [P13-04] Permission/sandbox ceiling

Verify the spike never weakens native Codex sandbox/permission settings. A plugin Task/Skill request cannot be treated as authority to bypass host controls.

<a id="p13-05"></a>
## [P13-05] Cleanup

Document and execute cleanup for:

- local marketplace entry;
- temporary plugin installation;
- temporary custom agent profiles;
- hook trust/config if added solely for spike;
- fixture worktrees;
- `PLUGIN_DATA` spike artifacts;
- temporary local environment config.

Preserve only the durable PH-00 report/evidence required by the project.

---

# Probe 14 — Consolidation and architecture decisions

<a id="p14-01"></a>
## [P14-01] Complete native capability matrix

Required final matrix:

| Capability | Desktop | CLI | Public contract | Live evidence | Classification | Production dependency allowed? | Fallback |
|---|---|---|---|---|---|---|---|
| plugin install | | | | | | | |
| packaged Skill | | | | | | | |
| MCP read tool | | | | | | | |
| MCP UI inline | | N/A/host | | | | | text |
| fullscreen | | N/A | | | | | inline |
| PiP | | N/A | | | | | fullscreen/inline |
| modal | | N/A | | | | | fullscreen |
| `_meta` UI-only | | N/A | | | | | compact structuredContent |
| UI tool call | | N/A | | | | | chat/tool |
| UI follow-up | | N/A | | | | | user chat |
| plugin hooks | | | | | | | explicit MCP/degraded |
| `PLUGIN_DATA` | | | | | | | repo temp only if needed |
| custom agent profile | | | | | | | generic native child |
| bounded/fresh child context | | | | | | | redesign capsule economics |
| child model override | | | | | | | safe defaults |
| subagent result delivery | | | | | | | bounded retry/block |
| worktree | | limited/manual | | | | | native local |
| local env setup | | N/A | | | | | repo setup docs |
| review | | | | | | | tests/manual |
| terminal | | native shell | | | | | native only |
| `codex agents` | N/A | | | | | | `/agent`/text |
| `codex exec --json` | N/A | | | | | | partial telemetry |
| descendant usage attribution | | | | | | | partial claims only |
| memories controls | | | | | | | none |
| third-party sidebar | | N/A | | | | | inline/fullscreen |

<a id="p14-02"></a>
## [P14-02] Update Master Plan only from evidence

For any assumption contradicted by H0:

1. identify affected `ARC/POL/SKL/AGT/CTX/OBS/UX` IDs;
2. create Roadmap Amendment;
3. modify Master/Roadmap before PH-01 planning;
4. retain PH-00 evidence link.

<a id="p14-03"></a>
## [P14-03] Freeze PH-01 input contracts

PH-01 may begin only after the following are frozen:

- plugin package shape actually tested;
- Skill lifecycle/activation behavior;
- MCP baseline and UI fallback;
- hook/trust/degraded contract;
- native agent/profile/context limitations;
- CLI parity boundary;
- trace completeness classification.

---

# 5. H0 transition gate

<a id="gate-h0-01"></a>
## [GATE-H0-01] Mandatory PASS conditions

All must be true:

- [ ] target Desktop and CLI versions recorded;
- [ ] target Plus model/effort surface recorded;
- [ ] clean-room/provenance baseline created;
- [ ] supported local plugin installation demonstrated in Desktop;
- [ ] plugin non-UI capability demonstrated in CLI where documented;
- [ ] packaged Skill can be invoked in a new session;
- [ ] read-only MCP tool works without UI;
- [ ] actual Codex Desktop UI rendering support is explicitly classified;
- [ ] `_meta` behavior is tested if UI renders;
- [ ] plugin hook trust/degraded behavior is demonstrated;
- [ ] `PLUGIN_DATA` behavior is demonstrated where hooks run;
- [ ] native subagent/custom-agent model behavior is documented;
- [ ] subagent context inheritance/bounded-context capability is explicitly classified;
- [ ] native worktree/review/terminal/local environment coverage is documented;
- [ ] CLI native agent/plugin controls are documented;
- [ ] `codex exec --json` current usage schema is captured;
- [ ] descendant usage attribution is `COMPLETE`, `PARTIAL` or `UNAVAILABLE` — never assumed;
- [ ] sidebar/workbench is `SUPPORTED_PUBLIC`, `UNSUPPORTED_PUBLIC` or `UNKNOWN_NOT_USED`;
- [ ] no private API is required by the selected production architecture;
- [ ] cleanup path is proven.

<a id="gate-h0-02"></a>
## [GATE-H0-02] H0 does not require every desired feature

H0 can PASS with:

- no PiP;
- no modal;
- no sidebar;
- partial trace attribution;
- some missing hook events;

provided the product has a supported fallback and no later phase falsely assumes the missing capability.

<a id="gate-h0-03"></a>
## [GATE-H0-03] H0 BLOCK conditions

PH-01 is blocked for architectural revision if any is true:

1. local Codex plugin cannot function on target Desktop/Plus account through supported mechanisms;
2. packaged Skills cannot provide a reliable procedure layer and no acceptable native fallback exists;
3. MCP cannot provide the required minimal state/tool interface in Desktop;
4. native subagent behavior fundamentally prevents bounded delegation **and** our value hypothesis depends on context isolation with no supported redesign;
5. the only workable Board path requires private Desktop internals;
6. the chosen architecture requires weakening native sandbox/permissions.

---

# 6. Explicit branch decisions

<a id="br-h0-01"></a>
## [BR-H0-01] Rich UI works in Codex Desktop

Continue with:

```text
MCP data tools
+ separate render tool
+ inline → fullscreen canonical Board
+ PiP/modal only if confirmed
```

<a id="br-h0-02"></a>
## [BR-H0-02] Rich UI does not render in Codex Desktop

Do **not** build a standalone app immediately.

PH-01/02 continue with Skills/MCP/Hooks/core. Board hypothesis is deferred or reduced to supported inline/text surfaces until Codex exposes a supported UI host.

<a id="br-h0-03"></a>
## [BR-H0-03] Sidebar unsupported publicly

Canonical Board remains inline/fullscreen. Delete sidebar from V1 requirements; keep it only in future capability watch.

<a id="br-h0-04"></a>
## [BR-H0-04] Bounded/fresh subagent context publicly available

Task Capsule can be treated as both:

- semantic authority/context contract;
- context-transfer boundary.

PH-03/04 may optimize around separate bounded worker context.

<a id="br-h0-05"></a>
## [BR-H0-05] Bounded/fresh context unavailable or partial

Task Capsule remains semantic but **not guaranteed token isolation**.

Required roadmap amendment before PH-03/04:

- revise Context Companion economics;
- benchmark parent-history amplification explicitly;
- prefer new root/isolated task surfaces where native Codex supports them;
- never claim subagent delegation itself reduces tokens;
- consider using fewer subagents or shorter parent sessions.

<a id="br-h0-06"></a>
## [BR-H0-06] Hook coverage incomplete

State projection becomes hybrid:

```text
hooks for observed lifecycle events
+ explicit MCP mutations for semantic transitions
+ reconciliation at read/recovery boundaries
```

Never parse private transcript as the production event bus.

<a id="br-h0-07"></a>
## [BR-H0-07] Descendant usage attribution partial/unavailable

PH-06 can still benchmark:

- root usage;
- quality;
- wall time;
- public child counts/state;

but total family token-saving claims are prohibited until an official complete surface exists. Diagnostic data may inform engineering without becoming a public claim.

<a id="br-h0-08"></a>
## [BR-H0-08] CLI native controls are sufficient

Do not create any Workflow Next CLI/TUI UI. Retain only text/status Skills/MCP tools.

---

# 7. Required PH-00 outputs

<a id="out-h0-01"></a>
## [OUT-H0-01] `PROVENANCE.md`

Contains:

- source repository matrix;
- license/reuse classification;
- clean-room rule;
- pinned upstream refs used for design comparison.

<a id="out-h0-02"></a>
## [OUT-H0-02] `docs/compatibility.md`

Minimum fields:

```text
Test date
OS
Desktop version
CLI version
Account/plan
Models/efforts observed
Plugin packaging
Skills lifecycle
MCP
UI modes
Hooks
PLUGIN_DATA
Agents/context behavior
Worktrees/local env
Review/terminal
CLI native controls
Trace schema
Descendant attribution
Sidebar status
Known bugs/degraded capabilities
```

<a id="out-h0-03"></a>
## [OUT-H0-03] `docs/ph00-capability-report.md`

Executive report:

1. what was proven;
2. what was absent;
3. what was only diagnostic/undocumented;
4. architecture changes required;
5. GO/BLOCK decision for PH-01;
6. exact source/evidence links.

<a id="out-h0-04"></a>
## [OUT-H0-04] `ADR-PH00-001-board-host.md`

Decision:

```text
canonical UI host
fallback
optional modes
sidebar status
```

<a id="out-h0-05"></a>
## [OUT-H0-05] `ADR-PH00-002-subagent-context.md`

Decision:

```text
public child-context semantics
model/effort override semantics
Task Capsule guarantees vs non-guarantees
Companion implications
```

<a id="out-h0-06"></a>
## [OUT-H0-06] `ADR-PH00-003-trace-attribution.md`

Decision:

```text
public trace source
fields
failure/interruption gaps
descendant attribution completeness
allowed benchmark claims
```

<a id="out-h0-07"></a>
## [OUT-H0-07] Evidence archive

All evidence referenced by the report is retained with no secrets and no dependency on ephemeral external UI state.

---

# 8. Completion report template

At the end Codex must return a concise summary using this exact shape:

```text
PH-00 RESULT: PASS | PASS_WITH_AMENDMENTS | BLOCKED

Target
- Desktop: ...
- CLI: ...
- OS: ...
- Plan: Plus

Critical findings
1. Plugin: ...
2. Skills: ...
3. MCP/UI: ...
4. Hooks/PLUGIN_DATA: ...
5. Subagent context: ...
6. Worktree/review/terminal: ...
7. CLI parity: ...
8. Trace attribution: ...
9. Sidebar: ...

Architecture amendments
- ...

Blocked assumptions
- ...

Evidence
- ...

Next allowed phase
- PH-01 / architecture review first
```

---

# 9. Instructions to the Codex executor

<a id="next-01"></a>
## [NEXT-01] Read hierarchy

Before execution:

1. read `CODEX_WORKFLOW_NEXT_ROADMAP.md` only for `PH-00`, `GATE-00`, `PLANSEED-00` and cross-cutting boundaries;
2. read `CODEX_WORKFLOW_NEXT_MASTER_PLAN.md` only for `MILE-00`, `WP-001..009`, `AC-10`, `NOGO-*` and referenced `SRC-*`;
3. execute this PH-00 detailed plan as the current scope;
4. consult current official OpenAI documentation when observed behavior differs from the frozen 2026-09-03 baseline.

<a id="next-02"></a>
## [NEXT-02] Do not implement PH-01 early

No production:

- domain model;
- SQLite schema;
- router;
- Context Index;
- production Companion;
- production Board;
- durable scheduler/recovery;
- benchmark corpus.

Only throwaway capability fixtures and durable evidence/docs are allowed.

<a id="next-03"></a>
## [NEXT-03] Do not hide negative results

A missing capability is a successful H0 finding. Never patch around an unsupported host API just to make the planned architecture appear viable.

<a id="next-04"></a>
## [NEXT-04] Verify before claiming

For every `PUBLIC_CONFIRMED` result, include reproducible evidence. If the result depends on a one-off UI observation, include screenshot + exact build/version + reproduction steps.

<a id="next-05"></a>
## [NEXT-05] Architecture review after H0

Do not immediately start PH-01 after writing the report. First compare the H0 findings with Master/Roadmap and apply any required amendments. Only then create the detailed PH-01 implementation plan.

---

# 10. Why this H0 order is optimal

1. **Environment first** prevents testing stale clients or unavailable Plus features.
2. **Plugin/Skill/MCP before UI** proves the product can work without presentation.
3. **UI before production Board** prevents designing against ChatGPT-only features that Codex Desktop may not expose.
4. **Hooks before state architecture** tells PH-02 what events are actually observable and trusted.
5. **Subagent context before Companion/router implementation** validates the central context-economy hypothesis before investing in it.
6. **Native worktree/review/terminal coverage** removes duplicate code before PH-01/02 scope freezes.
7. **CLI parity** prevents an unnecessary second UX.
8. **Trace completeness before A/B/C tooling** determines what PH-06 can honestly measure.
9. **Sidebar last** because it is UX enhancement, not a core viability dependency.
10. **Final amendments before PH-01** ensure we build from evidence rather than the assumptions that existed when the Master Plan was written.

---

# 11. Source map

<a id="h0-src-01"></a>
## [H0-SRC-01] Codex / ChatGPT changelog

https://learn.chatgpt.com/docs/changelog

Used for current stable CLI/Desktop capability changes; 0.152.0 is listed on 2026-09-01, with recent native `codex agents`, `codex queue`, `codex doctor`, plugin/MCP improvements in August.

<a id="h0-src-02"></a>
## [H0-SRC-02] Codex plugins

https://learn.chatgpt.com/docs/plugins  
https://learn.chatgpt.com/docs/build-plugins

Used for `.codex-plugin/plugin.json`, local marketplaces, packaged Skills/MCP, Desktop/CLI availability and host/plan-dependent capability rules.

<a id="h0-src-03"></a>
## [H0-SRC-03] Hooks

https://learn.chatgpt.com/docs/hooks

Used for trust semantics, lifecycle events, `PLUGIN_ROOT`, `PLUGIN_DATA`, synchronous/async behavior and supported handler types.

<a id="h0-src-04"></a>
## [H0-SRC-04] Subagents/custom agents

https://learn.chatgpt.com/docs/agent-configuration/subagents

Used for native separate threads, custom agents, model/reasoning configuration and warning that multi-agent workflows consume additional tokens.

<a id="h0-src-05"></a>
## [H0-SRC-05] Worktrees / local environments

https://learn.chatgpt.com/docs/environments/git-worktrees  
https://learn.chatgpt.com/docs/environments/local-environment

Used for managed worktrees, `.worktreeinclude`, setup scripts/actions and native Git workflow boundaries.

<a id="h0-src-06"></a>
## [H0-SRC-06] Review and terminal

https://learn.chatgpt.com/docs/code-review  
https://learn.chatgpt.com/docs/integrated-terminal

Used to prove native review/diff and terminal surfaces already cover responsibilities that Workflow Next must not duplicate.

<a id="h0-src-07"></a>
## [H0-SRC-07] MCP plugin UI / reference

https://developers.openai.com/plugins/build/chatgpt-ui  
https://developers.openai.com/plugins/reference

Used for MCP Apps bridge, data/render separation, `structuredContent`/`content` vs UI-only `_meta`, fullscreen/PiP requests, modal, UI tool calls and follow-up messages. H0 explicitly verifies which of these are actually supported in Codex Desktop rather than assuming ChatGPT UI parity.

<a id="h0-src-08"></a>
## [H0-SRC-08] Non-interactive trace surface

https://learn.chatgpt.com/docs/non-interactive-mode

Used for `codex exec --json` JSONL event and token-usage validation.

<a id="h0-src-09"></a>
## [H0-SRC-09] GPT-5.6 / Codex model availability

https://help.openai.com/en/articles/20001354-gpt-5-6-in-chatgpt  
https://learn.chatgpt.com/docs/models  
https://developers.openai.com/api/docs/guides/latest-model

Used for current Sol/Terra/Luna positioning. Live Plus Codex model/effort availability is still captured empirically in P00.

<a id="h0-src-10"></a>
## [H0-SRC-10] Plan access

https://help.openai.com/en/articles/11369540

Used to anchor that Codex is included with ChatGPT Plus and the app already provides built-in worktrees, Skills, automations and Git functionality.

<a id="h0-src-11"></a>
## [H0-SRC-11] Diagnostic current MultiAgentV2 issues — non-normative

https://github.com/openai/codex/issues/38989  
https://github.com/openai/codex/issues/26822  
https://community.openai.com/t/sub-agents-are-fully-hydrating-parents-context/1393050

These are **not contracts**. They justify P07's live context/result-delivery tests because current users have reported high usage from history-carrying child contexts and unreliable child result delivery. Production design must still rely on supported public behavior.

---

# 12. Definition of done

PH-00/H0 is done only when:

```text
we know which public Codex primitives exist on our actual target account/build;
we know which assumptions in Master Plan are true, degraded or false;
we have a supported V1 fallback for every non-critical missing capability;
we know whether native subagents provide the context boundary our economics assume;
we know exactly what later A/B/C telemetry can honestly measure;
and PH-01 can be planned without guessing about the host.
```

Anything beyond that is premature production implementation and must wait for PH-01.
