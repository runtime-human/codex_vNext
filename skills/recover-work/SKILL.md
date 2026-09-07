---
name: recover-work
description: Use when resuming Workflow Next after a restart, reconstructing the last safe continuation point, or asking where work stopped and what can safely happen next.
---

# Recover Work

Reconstruct a safe continuation point from durable operational state, not from transcript replay.

1. Determine the canonical project root and call `workflow.summary`.
2. If repository drift is `head_changed` or `project_identity_changed`, stop continuation and inspect current repository state.
3. Surface pending user decisions before implementation.
4. Surface cleanup-required resources before creating replacements.
5. For persisted `running` or `verifying` work, treat native liveness as unknown and reconcile repository state and evidence first. Use `work.get` only when the bounded item detail is needed.
6. Return the objective, active work, decisions, evidence pointers, repository fingerprint and drift, and `nextSafeAction`.

Use only read-only state tools. Do not reconstruct hidden reasoning, replay an old transcript, mutate state, or claim that a persisted worker is alive.
