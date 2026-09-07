---
name: orchestrate-work
description: Choose the smallest useful Codex topology and the correct named agent role for a substantive coding or research task. Use when deciding whether to work directly, delegate bounded work, investigate externally, use a difficult implementation worker, isolate writes, batch independent work, or require independent verification.
---

# Orchestrate Work

Keep the current Main responsible for user intent, project architecture, public-contract decisions, cross-package integration, final acceptance, and final claims. Main model selection is controlled by the user, not this Skill.

Prefer direct execution when delegation has no concrete isolation, specialization, parallelism, context-offload, or verification benefit.

When delegation is useful, choose the semantic role before any model/runtime mapping:

- `context_companion`: repeated or bulky local repository context, source cross-reference, or reusable context delta;
- `investigator`: bounded external/current web or documentation research;
- `executor`: bounded implementation with a reasonably clear implementation path;
- `senior_executor`: bounded implementation that requires substantial causal/root-cause, concurrency/state, mathematical/algorithmic, or cross-cutting local reasoning; comparison of several plausible internal solutions; or recovery from an Executor reasoning failure;
- `verifier`: fresh independent acceptance evidence when risk warrants it.

Senior does not own project architecture, public contracts, product trade-offs, ownership expansion, or final acceptance. Escalate those decisions to Main.

For any delegated role:

- define bounded ownership and acceptance;
- use the task-envelope Skill to produce a self-contained packet;
- prefer fresh worker context for Workflow Next workers;
- before substantive topology/resource mutation, resolve required capabilities/permissions/isolation and name a fallback when degraded;
- keep writes conservative when scopes or runtime resources can conflict;
- do not create nested management hierarchies;
- request independent verification proportionally to risk.

Batch independent work only when all items inform the same main-owned decision and there is no dependency, write overlap, or known runtime collision.

Do not select a provider model directly. PH-04 resolves the selected role through typed configuration. No worker may silently upgrade itself to a more expensive provider family; it returns an escalation to Main.

Do not claim token/cost savings from delegation without eval evidence.
