---
name: workflow-status
description: Use when asked what Workflow Next is doing, what state is persisted for a repository, where work stopped, or which decisions and cleanup remain.
---

# Workflow Status

Report persisted workflow state without changing it.

1. Determine the current canonical project root.
2. Call `workflow.summary` with `projectRoot`.
3. If no run is returned, say that no persisted workflow exists for the project.
4. Report the objective and run state, active work, pending decisions, cleanup-required resources, repository drift, and evidence completeness.
5. Preserve `liveness=unknown` as unknown. Persisted `running` does not prove that a native worker is alive.

Use only read-only state tools. Do not transition, resolve, repair, or infer live agent state.
