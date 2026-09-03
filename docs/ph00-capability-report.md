# PH-00 capability report

Status: `IN_PROGRESS`; final H0 decision waits for the target Desktop
checkpoint and P13 cleanup.

## Proven now

- current CLI `0.153.0`, plugin packaging, local marketplace installation,
  packaged Skill in fresh CLI/Desktop tasks, deterministic read-only MCP, and
  CLI parity;
- separate data/render contract and model-visible versus UI-only fields;
- Codex Desktop inline rendering, fullscreen transition, and follow-up with
  user confirmation; render-result `_meta` was unavailable on the tested path;
- task-only child context in the tested surface, repeat child-result delivery,
  custom project agent profile discovery, and blocked nested spawn in the
  tested child surface;
- public root JSONL usage, missing failed-turn usage, missing effective model,
  and partial descendant attribution;
- plugin correctness with native memory disabled;
- no documented public third-party sidebar API.

## Not yet proven

- installed Desktop build is the latest stable and the target account is Plus;
- Desktop component-originated tool call, PiP, and custom modal behavior;
- hook trust, lifecycle delivery, and real `PLUGIN_DATA` persistence;
- managed worktree, `.worktreeinclude`, local environment, review, and terminal
  behavior on this installation;
- plugin-disabled/MCP-unavailable degradation and complete cleanup.

## Current architecture implications

- no custom Workflow Next CLI/TUI: use native CLI controls;
- Task Capsule is semantic authority, but context/token isolation is not a
  broad guaranteed property;
- public telemetry supports root completed turns; family token claims are
  prohibited while child attribution remains partial;
- persistent sidebar is removed from V1; inline to fullscreen with text/tool
  fallback is the supported ladder;
- production correctness must not depend on render-result `_meta` or UI state
  surviving a display-mode transition;
- hooks cannot be the sole semantic event bus; explicit MCP transitions and
  reconciliation remain required if lifecycle coverage is incomplete.

Exact evidence is under `spikes/ph00/evidence`. The final GO/BLOCK decision is
intentionally not made before the remaining live target-host checks.
