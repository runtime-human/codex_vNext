# Codex Workflow Next — Product & Engineering Roadmap Baseline

**Статус:** базовый roadmap, утверждаемый до создания поэтапных implementation plans  
**Ревизия:** 1.0  
**Дата среза:** 2026-09-02  
**Продукт:** Codex Workflow Next / Codex Director  
**Основной host:** Codex Desktop  
**Совместимый host:** Codex CLI  
**Архитектурный источник истины:** [`CODEX_WORKFLOW_NEXT_MASTER_PLAN.md`](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md)  
**Назначение этого файла:** определить порядок развития продукта, архитектурные границы каждого этапа, обязательные deliverables, transition gates, evidence и зависимости. Каждый этап позже получает отдельный более подробный implementation plan.

> **Roadmap не заменяет Master Plan.** Master Plan определяет архитектуру, контракты и rationale. Roadmap определяет последовательность материализации этой архитектуры и условия, при которых проект имеет право двигаться дальше.
>
> **Главный принцип:** никакой следующий слой не строится только потому, что он есть в концепции. Он строится после того, как предыдущий слой доказан platform evidence, tests или A/B/C eval. Особенно это относится к Board, Durable Mode, routing optimization и Experience Promotion.

---

<a id="rm-idx-00"></a>
## [RM-IDX-00] Система индексации roadmap

| Префикс | Назначение |
|---|---|
| `RM-*` | мета-правила roadmap |
| `HZ-*` | крупные горизонты развития |
| `PH-*` | этапы/фазы roadmap |
| `STR-*` | сквозные инженерные потоки |
| `DELIV-*` | обязательные deliverables этапа |
| `SPEC-*` | спецификации/контракты, которые должны быть зафиксированы к gate |
| `DEP-*` | зависимости |
| `GATE-*` | transition gates между этапами |
| `BR-*` | условные ветвления roadmap |
| `RMRISK-*` | roadmap-level риски |
| `PLANSEED-*` | требования к будущему детальному плану этапа |
| `CHECK-*` | readiness/completion checklist |

### Cross-document meta-link convention

В issue, PR, commit, Board WorkItem и будущем implementation plan используем ссылки одновременно на roadmap и Master Plan:

```text
Roadmap: PH-04 / DELIV-04.02 / GATE-04
Master: MILE-04 / WP-041 / POL-03 / SKL-02 / AC-14
Sources: SRC-01 / SRC-06 / SRC-09
```

В Markdown допустимы прямые ссылки:

- `[MASTER:MILE-04](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#mile-04)`;
- `[MASTER:WP-041](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#wp-041)`;
- `[MASTER:ADR-03](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#adr-03)`.

---

<a id="rm-idx-01"></a>
## [RM-IDX-01] Быстрый индекс

| Область | Roadmap |
|---|---|
| Назначение и границы | [RM-01](#rm-01)–[RM-08](#rm-08) |
| Горизонты | [HZ-00](#hz-00)–[HZ-05](#hz-05) |
| Сквозные потоки | [STR-01](#str-01)–[STR-08](#str-08) |
| Capability/compatibility spike | [PH-00](#ph-00) |
| Plugin/domain foundation | [PH-01](#ph-01) |
| State/Hooks/MCP | [PH-02](#ph-02) |
| Context Companion | [PH-03](#ph-03) |
| Adaptive orchestration | [PH-04](#ph-04) |
| Verification/authority | [PH-05](#ph-05) |
| A/B/C Core Eval Gate | [PH-06](#ph-06) |
| Embedded Board Beta | [PH-07](#ph-07) |
| Durable Beta | [PH-08](#ph-08) |
| Optimization / Experience | [PH-09](#ph-09) |
| Hardening / Public V1 | [PH-10](#ph-10) |
| Branching rules | [BR-01](#br-01)–[BR-08](#br-08) |
| Roadmap risks | [RMRISK-01](#rmrisk-01)–[RMRISK-12](#rmrisk-12) |
| Source map | [RM-SRC-00](#rm-src-00) |
| Final roadmap DoD | [RM-DOD-00](#rm-dod-00) |

---

# 1. Roadmap Contract

<a id="rm-01"></a>
## [RM-01] Product boundary

Roadmap развивает **Desktop-first Codex plugin**, а не отдельный orchestration application.

Codex остаётся владельцем:

- chat/session runtime;
- native subagents;
- native worktrees;
- native review/diff;
- integrated terminal;
- sandbox, permissions и approvals;
- native search/web/MCP execution;
- cloud/automations там, где platform их предоставляет.

Наш слой владеет:

- adaptive policy;
- Task Capsule protocol;
- semantic role/model profiles;
- Context Companion policy;
- context index/provenance cache;
- risk-based verification policy;
- event projection/state;
- evidence normalization;
- human-attention Board;
- trace-based evals.

**Master:** [GOAL-01](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#goal-01), [GOAL-04](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#goal-04), [ADR-01](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#adr-01), [ADR-20](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#adr-20).

<a id="rm-02"></a>
## [RM-02] Native primitive first является roadmap gate, а не пожеланием

Перед созданием любого runtime-компонента отдельный detailed plan обязан ответить:

1. существует ли уже public/native Codex primitive;
2. можно ли выразить нужное поведение через Skill, Hook, MCP или native agent;
3. почему custom component всё ещё нужен;
4. как component деградирует при изменении host capability;
5. как его можно удалить, если Codex реализует эквивалент нативно.

Если native primitive появился между этапами, roadmap корректируется до реализации custom replacement.

**Sources:** [SRC-06](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-06), [SRC-08](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-08), [SRC-30](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-30), [SRC-33](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-33), [SRC-34](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-34).

<a id="rm-03"></a>
## [RM-03] Core value hypothesis

Workflow Next имеет смысл только если хотя бы часть workload получает measurable marginal value поверх современного native Codex.

Основная гипотеза:

```text
Main сохраняет intent / decisions / integration
        ↓
Task Capsule передаёт bounded knowledge
        ↓
Native workers поглощают operational noise
        ↓
Context Companion удерживает read-heavy project context отдельно
        ↓
Verifier включается только по риску
        ↓
Main получает concise evidence / delta
```

Проверяется в [PH-06](#ph-06), а не принимается на веру.

**Master:** [GOAL-03](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#goal-03), [ADR-03](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#adr-03), [ADR-05](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#adr-05), [ADR-21](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#adr-21).

<a id="rm-04"></a>
## [RM-04] UX hypothesis

Board не обязан быть причиной существования workflow core. Он проверяет отдельную гипотезу:

> при long-running/multi-agent work пользователь быстрее понимает `что требует внимания`, чем через просмотр отдельных native threads.

Board показывает прежде всего:

- `NEEDS_DECISION`;
- `BLOCKED`;
- `NEEDS_REVIEW`;
- failed verification;
- evidence completeness;
- policy explanation;
- run/usage completeness.

Board не должен превращаться в Jira, IDE, terminal или второй scheduler.

**Master:** [GOAL-02](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#goal-02), [UX-01](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#ux-01)–[UX-24](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#ux-24), [RISK-08](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#risk-08).

<a id="rm-05"></a>
## [RM-05] Durable hypothesis

Persistent dependencies/recovery нужны только если task действительно переживает session/restart или содержит зависимые parallel workstreams.

Durability **не является prerequisite** для Core Alpha и Board Beta.

**Master:** [ADR-15](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#adr-15), [ARC-20](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#arc-20)–[ARC-23](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#arc-23), [POL-07](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#pol-07).

<a id="rm-06"></a>
## [RM-06] Eval-before-expansion

После Core Alpha проект обязан пройти trace-based A/B/C gate до разработки полноценного Board/Durable слоя.

Primary evidence:

- correctness/hidden evaluator;
- raw token traces;
- root vs descendant/thread-family usage;
- cached/uncached usage;
- retries/rework;
- wall time;
- human interventions.

Account Usage/credits — secondary validation, не source of truth.

**Master:** [OBS-01](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#obs-01)–[OBS-16](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#obs-16), [ADR-21](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#adr-21), [AC-42](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#ac-42).

<a id="rm-07"></a>
## [RM-07] Clean-room boundary

Архитектурные идеи `codex_workflow` разрешено использовать как inspiration/rationale, но upstream code/prompts/instruction files нельзя дословно переносить без совместимой лицензии.

Каждый этап, затрагивающий заимствованную идею, сохраняет provenance note.

**Master:** [ADR-00](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#adr-00), [RISK-13](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#risk-13).

<a id="rm-08"></a>
## [RM-08] Roadmap change-control

Roadmap изменяется, если происходит одно из событий:

- Codex добавил native primitive, отменяющий planned custom layer;
- public extension contract изменился;
- A/B/C gate показал отсутствие marginal value;
- platform capability отсутствует в live spike;
- security/provenance issue делает этап небезопасным;
- workload data показывает другой bottleneck.

Любая существенная коррекция оформляется:

```text
Roadmap Amendment
Reason
Affected PH/DELIV/GATE
Affected Master IDs
Evidence/Sources
Migration impact
```

---

# 2. Horizons

<a id="hz-00"></a>
## [HZ-00] Horizon A — Platform Proof

**Фазы:** PH-00.  
**Цель:** доказать, что Desktop-first extension model работает на public contracts.

До завершения этого горизонта запрещено строить серьёзный Board/runtime вокруг неподтверждённого API.

<a id="hz-01"></a>
## [HZ-01] Horizon B — Minimal Core Foundation

**Фазы:** PH-01, PH-02.  
**Цель:** создать installable plugin, domain contracts, deterministic state/event substrate и MCP interfaces без intelligent orchestration complexity.

<a id="hz-02"></a>
## [HZ-02] Horizon C — Workflow Intelligence Core

**Фазы:** PH-03, PH-04, PH-05.  
**Цель:** материализовать Context Companion, Task Capsules, adaptive delegation и risk-based verification поверх native Codex.

<a id="hz-03"></a>
## [HZ-03] Horizon D — Prove Value

**Фаза:** PH-06.  
**Цель:** сравнить Stock Direct, Native Multi-Agent и Workflow Next. Результат определяет дальнейший scope.

Это главный архитектурный hinge roadmap.

<a id="hz-04"></a>
## [HZ-04] Horizon E — Product UX + Durability

**Фазы:** PH-07, PH-08.  
**Цель:** после Core evidence добавить embedded attention Board и conditional durability/recovery.

<a id="hz-05"></a>
## [HZ-05] Horizon F — Optimize, Harden, Release

**Фазы:** PH-09, PH-10.  
**Цель:** превратить экспериментально доказанные механизмы в калиброванный, поддерживаемый публичный plugin.

---

# 3. Cross-Cutting Engineering Streams

<a id="str-01"></a>
## [STR-01] Platform compatibility stream

Работает с PH-00 до PH-10.

Обязан поддерживать:

- tested Codex Desktop build/version;
- CLI version;
- Windows first-class compatibility;
- macOS/Linux smoke до Public V1;
- public capability matrix;
- documented fallback при отсутствии UI/hook/sidebar features.

Каждый platform-sensitive detailed plan начинается с повторной проверки [SRC-37](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-37).

<a id="str-02"></a>
## [STR-02] Provenance / licensing stream

На каждом этапе фиксирует:

- какие идеи пришли из upstream/community;
- копировался ли code/assets;
- license каждого code-bearing dependency/reference;
- clean-room notes.

Public V1 блокируется при незакрытом provenance gap.

<a id="str-03"></a>
## [STR-03] Security / authority stream

Основной invariant:

```text
EffectiveAuthority =
    NativeHostAuthority
  ∩ UserSessionAuthority
  ∩ ProjectPolicyAuthority
  ∩ TaskCapsuleAuthority
```

Ни Board, ни Capsule, ни Hook не могут расширить native/user authority.

Security развивается инкрементально: scope detection → tool guardrails → post-run verification → final threat model.

**Master:** [SEC-01](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#sec-01)–[SEC-12](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#sec-12).

<a id="str-04"></a>
## [STR-04] Trace/eval stream

Telemetry закладывается раньше intelligent routing, чтобы не появилось features без измерения.

Эволюция:

```text
PH-00 trace capability probe
→ PH-02 event/usage substrate
→ PH-04 policy traces
→ PH-06 A/B/C gate
→ PH-09 calibrated regression system
→ PH-10 publishable methodology
```

<a id="str-05"></a>
## [STR-05] Documentation / decision stream

Durable project truth остаётся в repo. Plugin DB хранит operational projection/cache.

Создавать ADR только для durable materially distinct decisions. Не превращать docs в AI-generated bureaucracy.

<a id="str-06"></a>
## [STR-06] UX stream

UX развивается по progressive surface:

```text
normal chat
→ inline status
→ fullscreen Board
→ optional PiP/modal
→ sidebar/workbench only if public API exists
```

CLI получает textual status, не отдельный product UI.

<a id="str-07"></a>
## [STR-07] Testing stream

Три класса проверок:

1. deterministic unit/contract tests;
2. live Codex capability smoke;
3. controlled eval/held-out task tests.

Platform success нельзя мокать для milestone acceptance.

<a id="str-08"></a>
## [STR-08] Release / rollback stream

Каждый этап обязан быть independently releasable internally и иметь rollback path. Public release появляется только в PH-10, но packaging, migration discipline и compatibility matrix создаются значительно раньше.

---

# 4. Dependency Graph

<a id="dep-00"></a>
## [DEP-00] Главная последовательность

```text
PH-00 Platform Capability Proof
          ↓
PH-01 Plugin + Domain Foundation
          ↓
PH-02 State / Hooks / MCP
          ↓
PH-03 Context Companion
          ↓
PH-04 Adaptive Delegation / Capsules
          ↓
PH-05 Verification / Authority
          ↓
PH-06 A/B/C CORE EVAL GATE
       ┌──┴────────────────────────────┐
       │                               │
       ↓                               ↓
 core value proven              core value weak
       │                               │
       ↓                               ├─ narrow core
PH-07 Board Beta                       ├─ Board-only UX hypothesis possible
       ↓                               └─ Durable blocked
PH-08 Durable Beta
       ↓
PH-09 Optimization / Experience
       ↓
PH-10 Public V1
```

### Parallelism rules

- STR-01/02/03/04 идут сквозь все фазы.
- UX design research PH-07 может идти до PH-06 только как **non-production exploration**, но implementation Board не опережает gate.
- Durable concepts можно исследовать до PH-08, но persistence/dependency machinery не внедряется в core path раньше gate.
- Public packaging/release scripts могут развиваться постепенно, но Public V1 readiness оценивается только в PH-10.

---

# 5. Phase Roadmap

<a id="ph-00"></a>
# [PH-00] Codex Desktop Extension Capability Proof

**Master milestone:** [MILE-00](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#mile-00)  
**Roadmap role:** снять platform uncertainty до проектирования production internals.  
**Класс:** feasibility/capability spike.  
**Следующий gate:** [GATE-00](#gate-00).

## [PH-00.1] Главные вопросы

1. Local Codex plugin реально устанавливается и работает в Desktop и CLI?
2. Skills активируются в новых chats ожидаемо?
3. MCP tool + embedded UI работает в Desktop host?
4. Можно ли получить inline → fullscreen; PiP/modal — если документированно доступны?
5. `_meta` действительно остаётся UI-only относительно model payload?
6. Какие hook events реально доступны в текущем build?
7. `PLUGIN_DATA` usable и writable?
8. Native subagent/custom agent visibility соответствует нашей модели?
9. Worktree/review/terminal уже покрывают planned runtime responsibilities?
10. Можно ли получить пригодный machine-readable token usage через `codex exec --json`?
11. Можно ли полностью/частично связать descendant subagent usage с root run?
12. Есть ли public third-party sidebar/workbench extension API?

## Deliverables

<a id="deliv-00-01"></a>
### [DELIV-00.01] Provenance baseline

- `PROVENANCE.md`;
- source/license matrix;
- clean-room rules;
- upstream SHA/ref snapshot.

**Master:** [WP-001](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#wp-001).

<a id="deliv-00-02"></a>
### [DELIV-00.02] Minimal local plugin proof

Минимальный `.codex-plugin/plugin.json`, один Skill, один MCP read-only tool.

**Master:** [WP-002](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#wp-002).

<a id="deliv-00-03"></a>
### [DELIV-00.03] Embedded UI capability report

Подтверждённые режимы UI, `_meta`, follow-up, tool-call from UI, composer coexistence.

**Master:** [WP-003](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#wp-003).

<a id="deliv-00-04"></a>
### [DELIV-00.04] Sidebar classification

Только один из статусов:

- `SUPPORTED_PUBLIC`;
- `UNSUPPORTED_PUBLIC`;
- `UNKNOWN_NOT_USED`.

Private reverse-engineering запрещён.

<a id="deliv-00-05"></a>
### [DELIV-00.05] Hooks/data/live runtime proof

Live fixtures для hook trust/degraded mode и `PLUGIN_DATA`.

<a id="deliv-00-06"></a>
### [DELIV-00.06] Native primitive capability map

Матрица:

| Capability | Desktop | CLI | Public contract | Fallback |
|---|---|---|---|---|
| subagents | | | | |
| custom agent profiles | | | | |
| worktrees | | | | |
| review | | | | |
| terminal | | | | |
| memories | | | | |
| hooks | | | | |
| MCP UI | | | | |
| trace usage | | | | |

<a id="deliv-00-07"></a>
### [DELIV-00.07] Compatibility baseline

`docs/compatibility.md` с фактическими версиями и unsupported capabilities.

## Specifications frozen at PH-00

<a id="spec-00-01"></a>
### [SPEC-00.01] Extension boundary

Production design может опираться только на confirmed public capabilities.

<a id="spec-00-02"></a>
### [SPEC-00.02] Board host strategy

- primary: inline card → fullscreen embedded Board;
- optional: PiP/modal если confirmed;
- sidebar: optional only after public proof.

<a id="spec-00-03"></a>
### [SPEC-00.03] Trace completeness classification

`complete | partial | unavailable` для descendant attribution.

## Boundaries / forbidden work

- никакой production Board;
- никакой SQLite domain architecture кроме throwaway probe;
- никакого App Server dependency;
- никакого Electron/private API reverse-engineering;
- никакой собственной worktree/review/terminal реализации.

<a id="gate-00"></a>
## [GATE-00] Platform viability gate

**PASS**, если выполнен [AC-10](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#ac-10) и существует документированный fallback для отсутствующих capabilities.

**FAIL/BRANCH**, если:

- plugin не работает в Desktop → product definition пересматривается;
- rich embedded UI недоступен → Board UX переходит в минимальный inline/text mode;
- hooks ненадёжны → state projection становится MCP-explicit/degraded;
- subagent attribution недоступна → total token claims откладываются, но core development может продолжиться.

## Future detailed plan seed

<a id="planseed-00"></a>
### [PLANSEED-00] PH-00 detailed plan обязан включить

- точные capability probes;
- tested Codex Desktop/CLI versions;
- минимальные throwaway files;
- live smoke matrix;
- evidence capture format;
- rollback/cleanup;
- explicit decision record по sidebar/trace attribution.

## Sources

[SRC-06](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-06), [SRC-08](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-08), [SRC-09](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-09), [SRC-30](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-30), [SRC-31](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-31), [SRC-32](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-32), [SRC-33](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-33), [SRC-34](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-34), [SRC-35](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-35), [SRC-36](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-36), [SRC-37](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-37), [SRC-44](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-44).

---

<a id="ph-01"></a>
# [PH-01] Plugin Foundation + Domain Contract Freeze

**Master milestone:** [MILE-01](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#mile-01)  
**Depends on:** GATE-00 PASS.  
**Purpose:** создать минимальный installable product skeleton без orchestration/state complexity.

## Architectural result

После PH-01 существует маленький plugin package с чистым domain model и Skills skeleton, но direct Codex task всё ещё может работать без workflow state/database.

## Deliverables

<a id="deliv-01-01"></a>
### [DELIV-01.01] Single-package TypeScript baseline

- Node 24 LTS baseline;
- TypeScript strict mode;
- test/lint/typecheck/package scripts;
- никаких Python runtime requirements.

**Master:** [ADR-07](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#adr-07), [ADR-08](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#adr-08), [ADR-18](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#adr-18).

<a id="deliv-01-02"></a>
### [DELIV-01.02] Domain schema package

Заморозить V1 semantics для:

- ProjectRef;
- WorkflowRun;
- WorkItem;
- TaskCapsule;
- AuthorityEnvelope;
- Evidence;
- Decision;
- ContextItem;
- WorkflowEvent;
- PolicyTrace.

Это не означает freeze конкретной SQLite schema; freeze относится к domain meaning.

<a id="deliv-01-03"></a>
### [DELIV-01.03] State-machine invariants

Чистые, тестируемые правила переходов:

- `done` только после required evidence;
- unresolved decision блокирует dependent completion;
- native agent completion не равно WorkItem completion;
- stale/unknown platform state не превращается в success.

<a id="deliv-01-04"></a>
### [DELIV-01.04] V1 Skill catalog skeleton

- `orchestrate-work`;
- `task-capsule`;
- `verify-work`;
- `recover-work`;
- `workflow-status`.

Skill descriptions должны быть mutually distinguishable и маленькими.

<a id="spec-01-01"></a>
## [SPEC-01.01] Skill / Script / Hook / MCP separation

К PH-01 freeze следующая responsibility matrix:

| Mechanism | Responsibility |
|---|---|
| `AGENTS.md` | краткие постоянные инварианты |
| Skill | reasoning/procedure |
| Native agent | bounded intelligent work |
| Script/helper | deterministic transform/check |
| Hook | lifecycle signal |
| MCP | state/UI interface |
| SQLite | operational projection/cache |
| Repo docs/code | durable authoritative truth |

## Boundaries

- no DB requirement for fast path;
- no own agent manager;
- no Board implementation;
- no routing score optimization;
- no durable DAG.

<a id="gate-01"></a>
## [GATE-01] Foundation contract gate

PASS при [AC-11](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#ac-11): installable package, green domain tests, valid transitions, non-overlapping Skill triggers, zero requirement of workflow runtime for direct tasks.

<a id="planseed-01"></a>
## [PLANSEED-01] Future PH-01 implementation plan

Должен раскрыть exact file map, JSON/Zod/TypeScript schemas, test fixtures, package validation, skill trigger test matrix и compatibility with PH-00 capability report.

## Sources

[SRC-09](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-09), [SRC-12](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-12), [SRC-31](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-31), [SRC-38](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-38).

---

<a id="ph-02"></a>
# [PH-02] Deterministic State, Hooks, MCP & Evidence Substrate

**Master milestone:** [MILE-02](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#mile-02)  
**Depends on:** GATE-01.  
**Purpose:** получить inspectable/recoverable operational projection до intelligent workflow features.

## Architectural result

Codex lifecycle/public actions могут проецироваться в локальное state без polling daemon. MCP предоставляет narrow state/UI interface. Direct Codex usage деградирует gracefully, если state unavailable.

## Deliverables

<a id="deliv-02-01"></a>
### [DELIV-02.01] SQLite operational store

Обязательные свойства:

- WAL;
- short transactions;
- `busy_timeout`;
- optimistic versioning;
- append-only event log + current projections;
- migration version;
- one schema migrator at a time;
- backup before incompatible migration;
- integrity diagnostics.

<a id="deliv-02-02"></a>
### [DELIV-02.02] Event normalization

Native hook events преобразуются в стабильную internal event schema.

Critical invariant:

```text
entity mutation + corresponding audit event
= one bounded SQLite transaction
```

Повторный event с тем же idempotency key не создаёт второй effect.

<a id="deliv-02-03"></a>
### [DELIV-02.03] Narrow MCP API

Минимум:

- workflow summary/read;
- WorkItem read/update;
- Decision read/resolve;
- Evidence read;
- Context query;
- Board render data later.

Все mutating tools получают explicit annotations/authority checks.

<a id="deliv-02-04"></a>
### [DELIV-02.04] Artifact store

Большие logs/results не должны автоматически возвращаться в model context. Сохраняются raw artifact + content hash + metadata + bounded preview.

<a id="deliv-02-05"></a>
### [DELIV-02.05] Plugin doctor

Human + JSON diagnostics для plugin install, hooks, MCP, state, capabilities и compatibility.

<a id="spec-02-01"></a>
## [SPEC-02.01] Source-of-truth hierarchy

```text
Code / current repo docs / ADR
        >
verified current source evidence
        >
plugin context index / projection
        >
native memory hints
```

Operational DB не может переопределять repository truth.

<a id="spec-02-02"></a>
## [SPEC-02.02] Degraded mode

Если Hooks/DB/MCP временно unavailable:

- direct Codex остаётся usable;
- plugin не объявляет stale state current;
- Board показывает unavailable/partial вместо fake status;
- mutation не пытается “догадаться” о результате.

<a id="gate-02"></a>
## [GATE-02] Deterministic substrate gate

PASS при [AC-12](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#ac-12), включая restart, idempotency и graceful degradation.

<a id="planseed-02"></a>
## [PLANSEED-02] Future PH-02 implementation plan

Должен включить exact SQL migrations, repository interfaces, concurrency tests, hook fixture corpus, MCP tool schemas, authority annotations, artifact retention и doctor diagnostics.

## Sources

[SRC-30](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-30), [SRC-31](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-31), [SRC-32](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-32), [SRC-41](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-41).

---

<a id="ph-03"></a>
# [PH-03] Context Companion & Provenance-Aware Context Economy

**Master milestone:** [MILE-03](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#mile-03)  
**Depends on:** PH-02.  
**Purpose:** сохранить сильнейшую идею `codex_workflow` — отдельный operational context — без превращения agent thread в долговременную БД.

## Core hypothesis

Context Companion должен уменьшать pressure основного Main context на read-heavy/long-running задачах, не увеличивая total thread-family usage настолько, что benefit исчезает.

Это **гипотеза до PH-06 eval**, поэтому Companion не становится unconditional default.

## Deliverables

<a id="deliv-03-01"></a>
### [DELIV-03.01] Native semantic agent templates

- Context Companion — local/read-only;
- Investigator — external research/read-only;
- Builder — bounded production;
- Verifier — independent verification.

Model IDs не входят в role names.

<a id="deliv-03-02"></a>
### [DELIV-03.02] Context Index V1

Без vector DB/embeddings. Каждая запись содержит provenance/freshness:

- kind/scope;
- summary/pointer;
- source URI/path;
- source hash / Git SHA where meaningful;
- verified timestamp;
- stale state.

<a id="deliv-03-03"></a>
### [DELIV-03.03] Project fingerprint / invalidation

Changed source делает derived context stale. Никакого silent reuse старого summary.

<a id="deliv-03-04"></a>
### [DELIV-03.04] Companion hydration capsule

Fresh Companion получает bounded hydration state, а не прошлый transcript целиком.

<a id="deliv-03-05"></a>
### [DELIV-03.05] Context Delta contract

Companion возвращает:

```text
Relevant facts
New discoveries
Changed since prior brief
Evidence pointers
Stale/uncertain facts
Decision needed
```

и не обязан повторять unchanged facts.

<a id="deliv-03-06"></a>
### [DELIV-03.06] Context-pressure heuristic v0

Rule-based activation signals только для shadow/initial policy:

- large repo;
- multi-module work;
- repeated navigation;
- long run;
- durable continuation;
- context pressure.

Не использовать invented numerical optimizer.

<a id="spec-03-01"></a>
## [SPEC-03.01] Three-level working memory model

```text
L1 Main context             decision-critical
L2 Context Companion        hot operational context
L3 Durable repo/index       persistent truth/cache pointers
```

Native memories — optional ambient helper, never correctness dependency.

## Boundaries

- Companion не существует для small direct task;
- no whole-repo scan at SessionStart;
- no “one eternal Companion per project”;
- one substantive run → one hot Companion, затем checkpoint/close;
- no vector DB V1.

<a id="gate-03"></a>
## [GATE-03] Context capability gate

PASS при [AC-13](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#ac-13). Экономический/токенный успех **ещё не считается доказанным** — только correctness/architecture capability.

<a id="planseed-03"></a>
## [PLANSEED-03] Future PH-03 implementation plan

Должен отдельно расписать agent TOML/config integration, hydration token budget, ContextItem invalidation, fingerprint performance, Context Delta schema и memories-off behavior.

## Sources

[SRC-01](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-01), [SRC-02](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-02), [SRC-04](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-04), [SRC-06](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-06), [SRC-14](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-14), [SRC-36](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-36).

---

<a id="ph-04"></a>
# [PH-04] Adaptive Delegation, Task Capsules & Semantic Model Profiles

**Master milestone:** [MILE-04](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#mile-04)  
**Depends on:** GATE-03.  
**Purpose:** заменить Light/Medium/Heavy на capability composition вокруг Main.

## Architectural result

Main Codex остаётся единственным orchestration intelligence owner. Plugin помогает решить, когда native delegation имеет positive expected value, и формирует bounded knowledge transfer.

## Deliverables

<a id="deliv-04-01"></a>
### [DELIV-04.01] Direct fast path

Отсутствие delegation является нормальным policy outcome.

Small/obvious tasks не создают WorkItem ceremony, Companion, Board dependency или verifier без причины.

<a id="deliv-04-02"></a>
### [DELIV-04.02] `orchestrate-work` Skill

Decision-table based policy, ориентированная на signals:

- context isolation benefit;
- read-heavy independence;
- specialist advantage;
- write conflict;
- task risk;
- external uncertainty;
- durability need.

Numerical scores допускаются только как shadow telemetry до PH-09 calibration.

<a id="deliv-04-03"></a>
### [DELIV-04.03] Task Capsule Protocol V1

Минимальный semantic contract:

```text
Objective
Expected outcome
Writable scope
Protected scope
Relevant decisions
Constraints
Evidence/code pointers
Verification obligation
Return contract
Authority narrowing
```

Task Capsule не копирует whole parent conversation.

<a id="deliv-04-04"></a>
### [DELIV-04.04] Semantic model profiles

Roles отделены от models:

```text
efficient
balanced
deep
critical
```

Actual mapping определяется current Codex config/capability. Silent expensive inheritance запрещено.

<a id="deliv-04-05"></a>
### [DELIV-04.05] Native Builder / Investigator flows

Примеры, которые должны быть доказаны:

```text
Main → Capsule → Native Builder → concise evidence → Main
Main → bounded research brief → Investigator → source-linked synthesis → Main
```

<a id="deliv-04-06"></a>
### [DELIV-04.06] Retry / capability escalation contract

Semantic failure не повторяется blind retry.

```text
attempt
→ evidence-guided repair
→ fresh alternative only if hypothesis changes
→ stronger/different capability
→ BLOCKED / user decision
```

<a id="deliv-04-07"></a>
### [DELIV-04.07] No-duplicate-work instrumentation

Main не должен повторять свежую delegated exploration без конкретной причины. Это проверяется traces/eval, а не только prompt rule.

<a id="spec-04-01"></a>
## [SPEC-04.01] Main ownership

Main owns:

- user intent;
- architecture;
- cross-package trade-offs;
- integration;
- final acceptance;
- final claims.

Workers provide bounded execution/evidence, не становятся вторым management hierarchy.

<a id="gate-04"></a>
## [GATE-04] Orchestration capability gate

PASS при [AC-14](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#ac-14). PH-04 подтверждает функциональность, но не claims о savings/quality advantage.

<a id="planseed-04"></a>
## [PLANSEED-04] Future PH-04 implementation plan

Должен содержать prompt/Skill contracts, policy decision table, capsule schema+validator, model profile resolver, representative Bounded Builder/Investigator fixtures и retry state transitions.

## Sources

[SRC-01](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-01), [SRC-02](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-02), [SRC-06](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-06), [SRC-09](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-09), [SRC-16](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-16), [SRC-17](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-17), [SRC-25](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-25), [SRC-29](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-29), [SRC-40](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-40).

---

<a id="ph-05"></a>
# [PH-05] Verification, Evidence & Effective Authority

**Master milestone:** [MILE-05](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#mile-05)  
**Depends on:** PH-04.  
**Purpose:** завершить correctness/safety boundary Core Alpha до сравнительных evals.

## Deliverables

<a id="deliv-05-01"></a>
### [DELIV-05.01] Transparent risk classifier

LOW/MEDIUM/HIGH/CRITICAL — rule-based и объяснимый. Нет псевдо-точных numeric thresholds без данных.

<a id="deliv-05-02"></a>
### [DELIV-05.02] Risk-based verification policy

- LOW: focused checks/self-verification;
- MEDIUM/HIGH: fresh Verifier, если даёт независимое evidence;
- CRITICAL: Main + specialist/explicit human authority where required.

Не существует mandatory reviewer chain для каждого task.

<a id="deliv-05-03"></a>
### [DELIV-05.03] Native review integration

Codex `/review`/native review остаётся canonical diff/review UX. Plugin хранит только evidence/projection, не дублирует diff UI.

<a id="deliv-05-04"></a>
### [DELIV-05.04] Evidence normalization

Checks хранят:

- command/check identity;
- status/exit;
- duration;
- artifact pointer/hash;
- provenance;
- completeness.

Raw logs → artifact, model получает bounded preview/pointer.

<a id="deliv-05-05"></a>
### [DELIV-05.05] Effective Authority enforcement

```text
EffectiveAuthority =
  Host ∩ User ∩ Project ∩ Capsule
```

Использовать public `PreToolUse`/available hooks для механически observable restrictions; обязательно проводить post-run changed-path validation.

<a id="deliv-05-06"></a>
### [DELIV-05.06] Completion validator

`DONE` запрещён при:

- failed required evidence;
- unresolved required decision;
- protected-scope mutation;
- unknown/stale completion state;
- unverified high-risk condition.

<a id="spec-05-01"></a>
## [SPEC-05.01] Evidence-before-claim

Worker report — evidence input, не автоматическая truth. Main обязан inspect material evidence для high-impact final claims.

<a id="gate-05"></a>
## [GATE-05] Core Alpha correctness gate

PASS при [AC-15](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#ac-15).

После GATE-05 **запрещено сразу идти к Board**. Следующий обязательный этап — PH-06 eval.

<a id="planseed-05"></a>
## [PLANSEED-05] Future PH-05 implementation plan

Должен включить risk fixtures, verifier contracts, native review procedure, Evidence schema, path/tool authority tests, post-run diff guardrail и completion failure matrix.

## Sources

[SRC-06](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-06), [SRC-30](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-30), [SRC-33](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-33), [SRC-14](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-14).

---

<a id="ph-06"></a>
# [PH-06] Core Alpha Trace-Based A/B/C Architecture Gate

**Master milestone:** [MILE-06](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#mile-06)  
**Depends on:** GATE-05.  
**Purpose:** определить, существует ли measurable product value поверх native Codex до дальнейшего расширения.

## [PH-06.1] Baselines

### A — Stock Codex Direct

- plugin off;
- no forced subagents;
- normal direct Codex behavior.

### B — Native Codex Multi-Agent

- native subagents;
- native profiles/worktrees where appropriate;
- best-practice prompt/config;
- **без Workflow Next policy/capsules/state layer**.

### C — Workflow Next Core

- adaptive policy;
- Task Capsules;
- conditional Companion;
- semantic profiles;
- risk-based verifier;
- no Board dependency.

### D — optional historical reference

`codex_workflow experiment`, только если легально/технически корректно воспроизводится. Не является обязательным product baseline.

## Deliverables

<a id="deliv-06-01"></a>
### [DELIV-06.01] Neutral observer

Одинаковая instrumentation layer для A/B/C, не меняющая semantic instructions.

<a id="deliv-06-02"></a>
### [DELIV-06.02] Trace runner / immutable raw artifacts

Primary controlled surface: `codex exec --json` с ChatGPT subscription auth where supported.

Сохранять:

- raw JSONL;
- collector/parser version;
- Codex version;
- repo SHA;
- model/effort;
- memory/fast mode state;
- timestamps.

<a id="deliv-06-03"></a>
### [DELIV-06.03] Thread-family attribution

Отдельно считать:

- Main/root usage;
- descendant worker usage;
- cached input;
- uncached input;
- output;
- reasoning output;
- completeness.

`Total saving` claim запрещён при partial descendant attribution.

<a id="deliv-06-04"></a>
### [DELIV-06.04] Frozen corpus v1

Task classes:

- `S`: small/fast-path;
- `R`: read/context-heavy;
- `W`: bounded implementation;
- `H`: high-risk correctness.

`D` recovery появляется в PH-08.

Каждый task:

- frozen repo SHA;
- identical user prompt;
- acceptance contract;
- hidden/frozen evaluator;
- same permissions/environment;
- fresh thread;
- memories off;
- fast mode pinned/off.

<a id="deliv-06-05"></a>
### [DELIV-06.05] Controlled A/B/C campaign

Этапы:

```text
Harness validation: 3 tasks × A/B/C = 9 runs
Pilot:              6 tasks × A/B/C = 18 runs
Core campaign:      ~10–12 tasks × A/B/C = 30–36 runs
Selective replicate: only ambiguous/high-variance claims
```

Порядок arms балансируется/рандомизируется.

<a id="deliv-06-06"></a>
### [DELIV-06.06] Product-default eval

После controlled campaign отдельно сравниваются реальные recommended settings каждой системы. Controlled и product-default результаты не смешиваются.

<a id="deliv-06-07"></a>
### [DELIV-06.07] Targeted ablations

Только после baseline C:

- Companion on/off на R-class;
- Verifier on/off на H-class;
- fixed/adaptive profiles;
- capsule variants при необходимости.

Никакого factorial explosion.

<a id="deliv-06-08"></a>
### [DELIV-06.08] Core Alpha decision report

Per-task paired table:

| Metric family | Required |
|---|---|
| correctness | yes |
| hidden evaluator | yes |
| Main tokens | yes |
| family tokens/completeness | yes |
| cached vs uncached | yes |
| output/reasoning | yes |
| wall time | yes |
| retries | yes |
| human actions | yes |
| duplicate work | where measurable |
| policy explanation | C only |

No single opaque “Director Score”.

<a id="spec-06-01"></a>
## [SPEC-06.01] Quality-first comparison

Correctness/acceptance is gate. Resource metrics сравниваются только после quality threshold.

<a id="spec-06-02"></a>
## [SPEC-06.02] Plus benchmark semantics

Raw traces — primary resource evidence. Account Usage/credits — secondary validation. API-key runs не подтверждают Plus-subscription claims.

<a id="gate-06"></a>
## [GATE-06] Core value gate

Решение принимает не “средний score”, а multi-objective evidence.

### PASS — Continue Core

C не имеет material quality regression и даёт measurable marginal value хотя бы на целевых classes по одному или нескольким направлениям:

- lower resource usage;
- higher correctness;
- fewer human interventions;
- lower wall time;
- cleaner main context;
- fewer repeated operations.

### CONDITIONAL — Narrow Core

C useful только на отдельных classes/features. Default policy сужается; невыгодные Companion/Verifier/router capabilities становятся conditional/off.

### UX-ONLY BRANCH

Если B≈C по core, но attention problem остаётся, PH-07 может продолжиться как **отдельная Board UX hypothesis**, но PH-08 Durable блокируется до нового evidence.

### FAIL / REDESIGN

C хуже B без compensating value. Core features удаляются/перепроектируются до продолжения roadmap.

**Master acceptance:** [AC-16](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#ac-16).

<a id="planseed-06"></a>
## [PLANSEED-06] Future PH-06 implementation plan

Должен содержать corpus manifest, reset/fresh-thread automation, trace schema, completeness policy, randomization schedule, hidden evaluators, invalidated-run protocol, Plus budget ceiling, reporting notebooks/scripts и explicit branch-decision template.

## Sources

[SRC-16](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-16), [SRC-27](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-27), [SRC-28](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-28), [SRC-44](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-44), [SRC-45](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-45), [SRC-46](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-46), [SRC-47](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-47), [SRC-48](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-48).

---

<a id="ph-07"></a>
# [PH-07] Embedded Desktop Board Beta — Human Attention Layer

**Master milestone:** [MILE-07](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#mile-07)  
**Entry condition:** GATE-06 PASS/CONDITIONAL либо UX-ONLY BRANCH с отдельной гипотезой.  
**Purpose:** сделать operational state полезным человеку внутри Codex Desktop, не создавая второй control runtime.

## Core UX principle

Board — projection/attention UI. Reasoning/orchestration остаётся у Main Codex.

## Deliverables

<a id="deliv-07-01"></a>
### [DELIV-07.01] Inline status entry point

Компактная chat card:

- run state;
- running count;
- blocker/decision/review count;
- `Open Board`.

<a id="deliv-07-02"></a>
### [DELIV-07.02] Fullscreen embedded Board

Обязательные области:

- current objective;
- Needs Attention;
- Ready/Running/Verify/Blocked/Done projection;
- WorkItem inspector;
- evidence;
- policy explanation;
- usage/trace completeness.

<a id="deliv-07-03"></a>
### [DELIV-07.03] Decision Inbox

Human decision object должен содержать:

- question;
- materially distinct options;
- recommendation, если evidence достаточен;
- consequences;
- evidence links;
- `Discuss in chat`.

Board mutation не spawn'ит agent напрямую; reasoning action возвращается Main.

<a id="deliv-07-04"></a>
### [DELIV-07.04] Evidence inspector

Показывает provenance/status/artifact, но не подменяет native review/terminal.

<a id="deliv-07-05"></a>
### [DELIV-07.05] `_meta` context hygiene

Rich Board payload остаётся UI-only там, где возможно; model-facing structuredContent содержит только concise state needed for reasoning.

<a id="deliv-07-06"></a>
### [DELIV-07.06] Optional host modes

- PiP — только если подтверждён в PH-00;
- modal — только если подтверждён;
- sidebar/workbench — только public supported contract.

<a id="deliv-07-07"></a>
### [DELIV-07.07] Accessibility/performance

Keyboard/focus/screen-reader, lazy detail loading, no huge initial Board payload.

<a id="deliv-07-08"></a>
### [DELIV-07.08] Attention UX study

Сравнить Board с native threads alone:

- time to identify blocker;
- time to identify human decision;
- unnecessary thread opens;
- missed failed verification;
- subjective state comprehension secondary.

<a id="spec-07-01"></a>
## [SPEC-07.01] Board anti-scope

V1 Beta не реализует:

- backlog/project management suite;
- arbitrary manual drag-and-drop scheduler;
- custom Git UI;
- custom terminal;
- full agent transcript replacement;
- own task execution daemon.

<a id="gate-07"></a>
## [GATE-07] Board Beta value gate

PASS при [AC-17](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#ac-17) и evidence, что Board улучшает attention/decision workflow, а не только визуально дублирует Codex.

Если benefit слабый, Board сокращается до status + decision/evidence inspector.

<a id="planseed-07"></a>
## [PLANSEED-07] Future PH-07 implementation plan

Должен включить UI information architecture, component/tool schemas, `_meta` budget, accessibility, failure/offline state, Board→chat actions, native thread/review deep-link behavior и UX evaluation script.

## Sources

[SRC-15](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-15), [SRC-21](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-21), [SRC-32](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-32), [SRC-35](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-35), [SRC-41](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-41).

---

<a id="ph-08"></a>
# [PH-08] Durable Beta — Recovery, Dependencies & Runtime Isolation Semantics

**Master milestone:** [MILE-08](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#mile-08)  
**Entry:** Core value proven enough to justify long-horizon state.  
**Purpose:** позволить substantive run пережить restart/HEAD drift/partial work без превращения каждого prompt в DAG.

## Deliverables

<a id="deliv-08-01"></a>
### [DELIV-08.01] Conditional durable materialization

Durable state создаётся только если:

- explicit user request;
- multi-session objective;
- meaningful dependencies;
- unattended/background continuation;
- multiple independent writers/workstreams.

<a id="deliv-08-02"></a>
### [DELIV-08.02] Minimal dependency graph

Only execution-relevant dependencies. Не превращать Board в planning ontology.

<a id="deliv-08-03"></a>
### [DELIV-08.03] RuntimeIsolationProfile

Worktree ≠ full runtime isolation.

Отдельно классифицировать:

- filesystem checkout;
- ports;
- DB/data namespace;
- external services;
- temp/cache;
- credentials/test accounts.

Unknown → conservative serialization for conflicting runtime phases.

<a id="deliv-08-04"></a>
### [DELIV-08.04] Native worktree policy

Plugin решает **нужна ли isolation**, Codex/Git native primitive выполняет worktree lifecycle. Никакого чтения `$CODEX_HOME/worktrees` как private API.

<a id="deliv-08-05"></a>
### [DELIV-08.05] Recovery reconciliation

После restart:

1. прочитать durable objective/state;
2. сверить current repo HEAD/dirty state;
3. проверить native thread/worktree evidence, если publicly observable;
4. invalidate stale context;
5. восстановить unresolved decisions;
6. не повторять completed work без evidence gap;
7. ambiguity → BLOCKED, не guessed success.

<a id="deliv-08-06"></a>
### [DELIV-08.06] Failure fingerprint

Сохраняется не длинный reasoning, а:

- failure type;
- evidence;
- attempted hypothesis;
- reason it failed;
- required new information/change before retry.

<a id="deliv-08-07"></a>
### [DELIV-08.07] D-class recovery corpus

Fixtures:

- deliberate Desktop/plugin restart;
- repo HEAD drift;
- missing worktree;
- shared DB/port collision;
- unresolved user decision;
- partially completed check.

<a id="spec-08-01"></a>
## [SPEC-08.01] Recovery correctness beats token economy

Для D-class первичная метрика — безопасное восстановление без repeated/corrupted work. Token saving secondary.

<a id="gate-08"></a>
## [GATE-08] Durable Beta gate

PASS при [AC-18](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#ac-18). Если durability требует собственного scheduler/container platform — остановиться и пересмотреть scope/integration with native tools.

<a id="planseed-08"></a>
## [PLANSEED-08] Future PH-08 implementation plan

Должен включить dependency schema, checkpoint/reconciliation algorithm, stale-state matrix, runtime-isolation config, worktree coexistence, cleanup/retention и destructive recovery tests.

## Sources

[SRC-08](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-08), [SRC-15](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-15), [SRC-19](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-19), [SRC-23](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-23), [SRC-29](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-29).

---

<a id="ph-09"></a>
# [PH-09] Eval Expansion, Policy Calibration & Experience Promotion

**Master milestone:** [MILE-09](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#mile-09)  
**Depends on:** реальные Core/Board/Durable runs.  
**Purpose:** превратить heuristic workflow в data-informed system, сохранив reversibility.

## Deliverables

<a id="deliv-09-01"></a>
### [DELIV-09.01] Versioned evaluation corpus

Добавить стабильный corpus S/R/W/H/D, changelog, invalidated runs и reproducible fixture reset.

<a id="deliv-09-02"></a>
### [DELIV-09.02] Paired reports + uncertainty

Публикуемые таблицы должны показывать raw/paired metrics и uncertainty, не один opaque score.

<a id="deliv-09-03"></a>
### [DELIV-09.03] Model/profile router calibration

Порядок:

```text
shadow signal
→ collect outcomes
→ compare success/rework/resources
→ calibrate threshold
→ canary enable
→ rollback if regression
```

Никакого “AI router score” без собственной evidence base.

<a id="deliv-09-04"></a>
### [DELIV-09.04] Companion ROI study

Проверяет:

- Main context reduction;
- total thread-family usage;
- quality;
- duplicate navigation;
- latency.

Если Companion не даёт marginal value на R-class, default activation сужается.

<a id="deliv-09-05"></a>
### [DELIV-09.05] Verification ROI study

Сравнить defects prevented / false completions prevented против дополнительного verifier usage и latency по risk classes.

<a id="deliv-09-06"></a>
### [DELIV-09.06] Board attention study

Перевести UX hypothesis в regression metric.

<a id="deliv-09-07"></a>
### [DELIV-09.07] Experience Promotion candidate

Verified successful run может стать candidate reusable recipe/Skill только после:

- human/automated review;
- de-project-specific normalization;
- eval на другой задаче;
- explicit promotion.

Автоматическое self-modifying prompt/Skill запрещено.

<a id="spec-09-01"></a>
## [SPEC-09.01] Removal is success

Если eval доказывает, что feature не даёт value, его отключение/удаление считается успешной оптимизацией продукта.

<a id="gate-09"></a>
## [GATE-09] Release-quality evidence gate

PASS при [AC-19](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#ac-19): reproducible evals, calibrated defaults, public-comprehensible methodology, no unsupported Plus-saving claims.

<a id="planseed-09"></a>
## [PLANSEED-09] Future PH-09 implementation plan

Должен включить corpus governance, statistical reporting, canary/rollback profile policy, ablation schedule, feature-removal criteria и promotion review process.

## Sources

[SRC-14](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-14), [SRC-16](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-16), [SRC-17](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-17), [SRC-27](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-27), [SRC-28](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-28), [SRC-47](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-47).

---

<a id="ph-10"></a>
# [PH-10] Hardening, Governance & Public V1

**Master milestone:** [MILE-10](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#mile-10)  
**Depends on:** GATE-09.  
**Purpose:** сделать доказанный internal product безопасным, переносимым и поддерживаемым публичным release.

## Deliverables

<a id="deliv-10-01"></a>
### [DELIV-10.01] Security review / threat model

Поверхности:

- plugin supply chain;
- MCP;
- hooks;
- embedded UI;
- SQLite/artifacts;
- Authority intersection;
- project path containment;
- secrets/redaction;
- migrations/upgrade.

<a id="deliv-10-02"></a>
### [DELIV-10.02] Cross-platform live smoke

- Windows — primary;
- macOS/Linux — supported matrix;
- Desktop/CLI versions documented;
- degraded capabilities explicit.

<a id="deliv-10-03"></a>
### [DELIV-10.03] Migration/coexistence with old `codex_workflow`

Только clean-room/new product path:

- detect old install;
- dry-run coexistence/import options;
- never silently overwrite user rules/docs;
- remove old managed blocks only with explicit safe procedure.

<a id="deliv-10-04"></a>
### [DELIV-10.04] Release provenance

- SBOM;
- dependency/license review;
- checksums/artifacts;
- release notes;
- compatibility matrix.

<a id="deliv-10-05"></a>
### [DELIV-10.05] User documentation

- install/update/remove;
- chat-first usage;
- Skills;
- agents/profiles;
- Board;
- CLI fallback;
- memories policy;
- privacy/state clear;
- benchmarks methodology;
- troubleshooting/doctor.

<a id="deliv-10-06"></a>
### [DELIV-10.06] Published benchmark evidence

Публиковать:

- corpus version;
- A/B/C definitions;
- raw/normalized artifacts where safe;
- completeness;
- invalidated runs;
- quality metrics;
- uncertainty;
- known limitations.

Не публиковать cherry-picked “X% saving” без trace completeness.

<a id="deliv-10-07"></a>
### [DELIV-10.07] Release governance

- protected main;
- PR checks;
- release checklist;
- compatibility policy;
- rollback;
- deprecation policy for host capabilities.

<a id="gate-10"></a>
## [GATE-10] Public V1 release gate

PASS только при [AC-20](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#ac-20), [AC-40](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#ac-40), [AC-41](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#ac-41), [AC-42](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#ac-42).

<a id="planseed-10"></a>
## [PLANSEED-10] Future PH-10 implementation plan

Должен включить formal threat model, release branch rules, platform smoke matrix, migration fixtures, reproducible packaging, docs checklist и public benchmark publication workflow.

## Sources

[SRC-24](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-24), [SRC-31](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-31), [SRC-37](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-37), [SRC-38](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-38), [SRC-44](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-44).

---

# 6. Roadmap Branching Rules

<a id="br-01"></a>
## [BR-01] Platform capability missing

Если planned host capability отсутствует:

```text
public fallback exists
→ use fallback

no public fallback
→ remove/defer feature
```

Never private reverse-engineering as release dependency.

<a id="br-02"></a>
## [BR-02] B Native Multi-Agent ≈ C Workflow Core

Если PH-06 показывает, что C почти не добавляет core value:

- удалить/сузить unnecessary routing/Companion/verifier defaults;
- сохранить Task Capsule только если ablation показывает value;
- Board разрешается как отдельная UX hypothesis;
- Durable expansion блокируется до дополнительного evidence.

<a id="br-03"></a>
## [BR-03] Companion negative ROI

Если Companion уменьшает Main context, но существенно увеличивает family usage/latency без quality benefit:

- activation threshold повышается;
- Companion становится opt-in/context-extreme capability;
- Context Index может остаться полезным без persistent hot agent.

<a id="br-04"></a>
## [BR-04] Verifier negative ROI

Если verifier не предотвращает meaningful defects в соответствующем risk class:

- убрать verifier для этого class;
- оставить focused deterministic checks/native review;
- пересмотреть risk policy.

<a id="br-05"></a>
## [BR-05] Board duplicates native Codex UX

Если attention study не показывает benefit:

- не развивать Kanban/state columns;
- сохранить минимальный status + decision/evidence inspector;
- следить за native Codex evolution.

<a id="br-06"></a>
## [BR-06] Durability becomes scheduler platform

Если PH-08 требует собственного job scheduler, container orchestration, worktree manager или distributed queue для базового value:

- остановить расширение;
- ограничить durability checkpoint/recovery;
- рассмотреть integration с native Symphony/другим control plane вместо собственной реализации.

<a id="br-07"></a>
## [BR-07] Trace attribution remains partial

- разрешены Main-context metrics;
- запрещены public total-token-saving claims;
- продолжить correctness/UX/evidence studies;
- периодически re-probe public telemetry capabilities.

<a id="br-08"></a>
## [BR-08] Codex adds native equivalent

Если host добавляет native Task Board/context management/router/evidence surface:

1. benchmark native feature против нашего;
2. prefer native if equal/better;
3. migrate state/UX;
4. удалить redundant custom layer.

---

# 7. Roadmap-Level Risks

<a id="rmrisk-01"></a>
## [RMRISK-01] Scope creep обратно в standalone orchestrator

**Signal:** появляются own agent manager, worktree manager, scheduler, terminal, diff UI.  
**Control:** RM-02 + architecture review каждого detailed plan.

<a id="rmrisk-02"></a>
## [RMRISK-02] Board начинает управлять агентами напрямую

**Control:** Board mutation изменяет bounded state/intent; reasoning/spawn остаётся Main/native Codex.

<a id="rmrisk-03"></a>
## [RMRISK-03] Operational DB становится source of truth

**Control:** SPEC-02.01; provenance/freshness; repo wins conflicts.

<a id="rmrisk-04"></a>
## [RMRISK-04] Context optimization измеряется только Main thread

**Control:** PH-06 family attribution/completeness.

<a id="rmrisk-05"></a>
## [RMRISK-05] Plus allowance сжигается на eval раньше продукта

**Control:** staged 9→18→30–36 campaign + selective replication + weekly budget ceiling.

<a id="rmrisk-06"></a>
## [RMRISK-06] Routing получает ложную математическую точность

**Control:** decision-table V1, shadow scores only, calibration PH-09.

<a id="rmrisk-07"></a>
## [RMRISK-07] Worktree трактуется как полная runtime isolation

**Control:** RuntimeIsolationProfile PH-08.

<a id="rmrisk-08"></a>
## [RMRISK-08] Skills превращаются в новый giant prompt

**Control:** небольшой catalog, progressive disclosure, trigger tests, references/scripts only on demand.

<a id="rmrisk-09"></a>
## [RMRISK-09] Companion превращается в stale eternal memory

**Control:** fresh per substantive run, hydration from current provenance, source invalidation.

<a id="rmrisk-10"></a>
## [RMRISK-10] Self-improvement раздувает policy/Skills

**Control:** Experience Promotion только PH-09 + eval + explicit approval.

<a id="rmrisk-11"></a>
## [RMRISK-11] Public Codex API изменяется между этапами

**Control:** STR-01 compatibility refresh at each PH detailed plan start.

<a id="rmrisk-12"></a>
## [RMRISK-12] Clean-room contamination

**Control:** STR-02 provenance review and no literal upstream prompt/code copy.

---

# 8. Future Detailed Plan Contract

<a id="rm-plan-00"></a>
## [RM-PLAN-00] Каждый этап получает отдельный implementation plan только при входе в фазу

Формат имени:

```text
docs/plans/PH-XX-<short-name>-implementation-plan.md
```

Каждый план обязан ссылаться на:

- `PH-*` roadmap;
- связанные `DELIV-*`;
- `GATE-*`;
- Master `MILE-*` / `WP-*` / `ARC-*` / `POL-*` / `AC-*`;
- `SRC-*`;
- compatibility snapshot.

<a id="rm-plan-01"></a>
## [RM-PLAN-01] Минимальное содержание future detailed plan

1. **Goal / non-goals** конкретной фазы.
2. **Current platform verification** на дату реализации.
3. **Exact file map** create/modify/delete.
4. **Interfaces/contracts** с типами/schema.
5. **Dependency decisions** и justification.
6. **Implementation task decomposition**.
7. **Test-first strategy** для deterministic code.
8. **Live platform smoke** для Codex-dependent behavior.
9. **Migration/rollback**.
10. **Telemetry/evidence**.
11. **Security/authority implications**.
12. **Provenance**.
13. **Gate checklist**.
14. **Out-of-scope discoveries** отдельным amendment, а не scope creep.

<a id="rm-plan-02"></a>
## [RM-PLAN-02] Task sizing rule

В detailed plans implementation task должен быть единицей, которую можно независимо проверить/review. Roadmap deliverable может разбиваться на несколько implementation tasks, но task не должен искусственно дробиться только ради количества.

<a id="rm-plan-03"></a>
## [RM-PLAN-03] PR metadata

Каждый PR должен содержать:

```text
Roadmap:
- PH-XX
- DELIV-XX.YY
- GATE-XX impact

Master:
- WP-...
- ARC/POL/SKL/AGT/SEC/OBS IDs
- AC-...

Evidence:
- tests
- live smoke
- trace/eval where required

Sources/Compatibility:
- SRC-...
- Codex Desktop/CLI version
```

---

# 9. Release Train / Artifact Evolution

<a id="rm-rel-00"></a>
## [RM-REL-00] Internal release stages

| Stage | Phases included | User-facing status |
|---|---|---|
| Capability Spike | PH-00 | throwaway/internal proof |
| Foundation Preview | PH-01–02 | internal plugin skeleton |
| Core Alpha | PH-03–05 | internal functional workflow core |
| Core Eval Candidate | PH-06 | benchmark/evidence release, not public promise |
| Board Beta | PH-07 | desktop UX beta |
| Durable Beta | PH-08 | long-running/recovery beta |
| Release Candidate | PH-09 | optimized/calibrated |
| Public V1 | PH-10 | supported release |

<a id="rm-rel-01"></a>
## [RM-REL-01] Artifact progression

```text
PH-00
  plugin proof + compatibility report

PH-01
  installable package + domain + skills skeleton

PH-02
  + state/hooks/MCP/artifacts/doctor

PH-03
  + semantic agents + Context Index/Companion

PH-04
  + task capsules + adaptive policy/model profiles

PH-05
  + verification/evidence/authority

PH-06
  + eval harness/corpus/reports

PH-07
  + embedded Board

PH-08
  + durable/recovery/runtime isolation semantics

PH-09
  + calibrated policy + regression evals + promotion candidate

PH-10
  + public packaging/docs/security/governance
```

---

# 10. Source Map

<a id="rm-src-00"></a>
## [RM-SRC-00] Источники и что именно из них используется

Roadmap наследует Source Index Master Plan. Здесь перечислены источники, прямо влияющие на sequencing.

| Source | Roadmap use | Boundary |
|---|---|---|
| [SRC-01](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-01) experiment AGENTS | Main ownership, Companion/Investigator, dynamic topology | ideas only, clean-room |
| [SRC-02](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-02) Heavy Route | Task Capsules, bounded ownership | no literal prompts/code |
| [SRC-04](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-04) 1.1.3 | historical knowledge-plane economics | benchmark reference, not runtime dependency |
| [SRC-06](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-06) Codex subagents | native threads, model inheritance, overhead | native primitive first |
| [SRC-08](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-08) Worktrees | filesystem isolation | not full runtime isolation |
| [SRC-09](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-09) Skills | progressive disclosure | keep catalog small |
| [SRC-14](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-14) Harness Engineering | lean repo knowledge, mechanical feedback, observability | adapt scale downward |
| [SRC-15](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-15) Symphony | attention/control plane, durable work | no own enterprise scheduler V1 |
| [SRC-16](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-16) Cursor swarm economics | planner/worker attribution, held-out eval | methodology reference |
| [SRC-17](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-17) Router | adaptive model idea | no opaque ML router before data |
| [SRC-18](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-18) codex-workflows | smallest sufficient process | no mandatory ceremony |
| [SRC-19](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-19) Crewplane | durable artifacts/DAG | optional PH-08 reference only |
| [SRC-20](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-20) Zuggie | spec/worktree/reviewer boundaries | no mandatory spec for small work |
| [SRC-21](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-21) Kandev | attention/control-plane UX | no standalone IDE |
| [SRC-23](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-23) yoshitani fork | recovery/failure-history | no-license + no full DAG core |
| [SRC-24](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-24) Aerox fork | release validation/cross-platform | release engineering only |
| [SRC-27](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-27) Reddit benchmark | whole-run rebound warning | secondary evidence |
| [SRC-28](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-28) Multi-tool benchmark | paired/whole-session methodology | secondary evidence |
| [SRC-29](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-29) WBS proposal | minimal packets, WBS only large tasks | not authoritative source |
| [SRC-30](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-30) Hooks | event-driven projection | no unstable transcript parser |
| [SRC-31](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-31) Plugins | native packaging | recheck every phase |
| [SRC-32](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-32) MCP UI | embedded Board, `_meta` | UI not orchestration owner |
| [SRC-33](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-33) Review | canonical diff/review | no duplicate review UI |
| [SRC-34](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-34) Terminal | native terminal | no web terminal |
| [SRC-35](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-35) Security Workbench | Desktop workbench precedent | not proof public sidebar API |
| [SRC-36](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-36) Memories | optional ambient recall | disabled for controlled evals |
| [SRC-37](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-37) Changelog | compatibility refresh | no fixed eternal version assumption |
| [SRC-40](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-40) Config | semantic profiles/model mapping | current public fields only |
| [SRC-41](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-41) Security plugin changelog | measured worker progress/recovery precedent | first-party pattern only |
| [SRC-44](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-44) `codex exec --json` | trace-based controlled eval | primary machine-readable eval surface |
| [SRC-45](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-45) Auth | subscription vs API benchmark semantics | keep campaigns separate |
| [SRC-46](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-46) Fast Mode | controlled eval pinning | no mixed service tier |
| [SRC-47](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-47) CursorBench | real tasks, offline/online split | methodology reference |
| [SRC-48](CODEX_WORKFLOW_NEXT_MASTER_PLAN.md#src-48) Plus usage | secondary account validation | not raw trace source |

---

# 11. Roadmap Readiness Checklists

<a id="check-00"></a>
## [CHECK-00] Before starting any PH detailed plan

- [ ] previous GATE passed or explicit branch selected;
- [ ] current Master Plan revision read;
- [ ] current Roadmap revision read;
- [ ] Codex changelog/platform docs rechecked;
- [ ] affected native primitives confirmed;
- [ ] sources/licenses reviewed;
- [ ] no duplicate native functionality planned;
- [ ] exact acceptance evidence known;
- [ ] rollback/degraded path known.

<a id="check-01"></a>
## [CHECK-01] Before closing any phase

- [ ] all DELIV for phase exist;
- [ ] linked Master AC satisfied;
- [ ] deterministic tests pass;
- [ ] live platform smoke performed where required;
- [ ] security/authority review complete;
- [ ] compatibility docs updated;
- [ ] provenance updated;
- [ ] no undocumented private API dependency;
- [ ] no placeholder/TODO in frozen contract;
- [ ] branch decision documented if result conditional.

<a id="check-02"></a>
## [CHECK-02] Before expanding scope

Ask explicitly:

1. Может ли это сделать native Codex теперь?
2. Есть ли evidence, что current bottleneck реален?
3. Можно ли решить меньшим Skill/Hook/MCP contract?
4. Нужен ли новый persistent state?
5. Какая eval докажет пользу?
6. Как удалить feature, если она не нужна?

---

# 12. Final Roadmap Definition of Done

<a id="rm-dod-00"></a>
## [RM-DOD-00] Roadmap считается выполненным, когда

1. **Platform proof** подтверждает public Desktop/CLI integration без private internals.
2. **Core** работает chat-first и не добавляет overhead small tasks.
3. **Task Capsule + native delegation** функциональны и bounded.
4. **Context Companion** conditional и provenance-aware, не stale project memory.
5. **Verification/authority** блокируют false completion и scope escape.
6. **A/B/C eval** показывает честный marginal value либо scope был сокращён в соответствии с evidence.
7. **Board** доказал attention value или был сокращён до минимального useful surface.
8. **Durability** включается только для long-horizon work и безопасно восстанавливается.
9. **Policy** калибрована по собственным traces, а не invented scalar score.
10. **Public release** имеет provenance, security review, compatibility, migration и publishable benchmark methodology.
11. Ни один custom component не существует только потому, что “так было в первоначальном плане”.

---

# 13. Executive Roadmap Summary

<a id="rm-summary-00"></a>
## [RM-SUMMARY-00] Последовательность одним экраном

```text
PH-00  PROVE CODEX EXTENSION SURFACE
       Plugin / MCP UI / Hooks / Agents / Worktrees / Traces
          ↓ GATE-00

PH-01  FREEZE MINIMAL DOMAIN + SKILLS
          ↓ GATE-01

PH-02  BUILD DETERMINISTIC STATE / HOOK / MCP SUBSTRATE
          ↓ GATE-02

PH-03  ADD CONDITIONAL CONTEXT COMPANION
          ↓ GATE-03

PH-04  ADD TASK CAPSULES + ADAPTIVE DELEGATION
          ↓ GATE-04

PH-05  ADD RISK VERIFICATION + AUTHORITY ENFORCEMENT
          ↓ GATE-05

PH-06  A/B/C TRACE EVAL
       A Stock vs B Native MA vs C Workflow
          ↓ GATE-06
       ┌───────────────┬──────────────────┐
       │ value proven  │ weak/no value    │
       ↓               ↓                  │
PH-07  BOARD BETA      narrow/remove core │
       ↓               Board UX may test  │
PH-08  DURABLE BETA ← only with evidence  │
       ↓                                  │
PH-09  CALIBRATE / OPTIMIZE / PROMOTE EXPERIENCE
       ↓
PH-10  HARDEN + PUBLIC V1
```

### Product identity after roadmap

Не “ещё один orchestrator”.

**Codex Workflow Next = минимальный policy/context/evidence/attention layer, который использует native Codex primitives и обязан доказать собственную полезность через traces и quality evals.**

