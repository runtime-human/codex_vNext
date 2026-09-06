# Codex Workflow Next development invariants

- Main thread owns final architecture, integration and user-visible claims.
- Follow the current phase plan; do not implement later phases early.
- Prefer native Codex primitives over custom runtime equivalents.
- Keep permanent instructions small; procedures belong in Skills.
- Repository code/docs/ADR are durable truth; generated context is secondary.
- Do not copy unlicensed upstream prompts/code; update PROVENANCE.md for external ideas/code.
- Do not weaken validation, sandbox or authority to reduce usage.

Architecture: `CODEX_WORKFLOW_NEXT_MASTER_PLAN_REV4.md`
Roadmap: `CODEX_WORKFLOW_NEXT_ROADMAP_REV2.md`
Current plan: `CODEX_WORKFLOW_PH01_IMPLEMENTATION_PLAN.md`
PH-00 evidence: `docs/compatibility/ph00-baseline.md`
