---
name: task-envelope
description: Create or update a bounded self-contained worker assignment for Codex subagents using TaskEnvelope, role-specific payload, stable TaskId, and delta-only follow-ups. Use immediately before substantive delegation or when changing an existing delegated task.
---

# Task Envelope

Create a stable TaskId that is independent of native Codex thread IDs.

For the initial dispatch produce:
1. TaskEnvelope: objective, expected outcome, writable/protected scope, constraints, relevant context/evidence pointers, acceptance, authority, return contract.
2. Exactly one role-specific payload appropriate to the worker.

The initial packet must be self-contained for a fresh worker. Do not copy the parent conversation or hidden reasoning.

For follow-ups, preserve the TaskId and send only a TaskDelta containing information that changed. Do not repeat unchanged context.

Task authority may only narrow user/project/native authority.
