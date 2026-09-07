# PH-00 capability report

Status: PH-00 executed; `GATE-H0=BLOCKED`. PH-01 was not started.

## Environment

- Windows 11 build 26200;
- Codex Desktop `26.901.1978.0` (installed/healthy; latest-stable not proven);
- Codex CLI `0.153.4`, matched official changelog and npm latest on 2026-09-06;
- Plus observed only in non-contractual local session telemetry.

## Critical findings

1. Plugin/Skill/MCP: supported local marketplace lifecycle, fresh Skill load,
   deterministic read tool and UI-independent data contract pass.
2. MCP/UI: inline, fullscreen and confirmed follow-up pass in Desktop. PiP and
   modal are optional; render-result `_meta` was absent on the tested path.
3. Hooks/PLUGIN_DATA: trust/activation is visible, but live Windows hook
   commands exit 1; plugin data is read-only to the sandbox token and the
   synchronous sentinel was not blocked. `BR-H0-09` applies.
4. Subagents: explicit `fork_turns=none` task/result delivery passed 3/3;
   follow-up, two parallel siblings and MCP inheritance passed. `1` delivered
   but did not reveal the parent marker. Default/`all` are unavailable under
   the current tool contract. Classification:
   `PUBLIC_BOUNDED_CONTEXT_PARTIAL`.
5. Trace: public root `turn.completed.usage` works; effective model and public
   descendant identity/usage do not. Descendant attribution is `PARTIAL`.
   Clean-room local ancestry is diagnostic only.
6. Native surfaces: official worktree/local environment/review/terminal
   boundaries are confirmed; target managed-worktree smoke remains a manual
   gap. No custom TUI, worktree manager, review UI or terminal was built.
7. Sidebar: `UNSUPPORTED_PUBLIC`; text → inline → fullscreen remains the host
   ladder.

## Gate decision

The Desktop-first plugin architecture remains viable, and the safe worker
subset is explicit fresh `fork_turns=none`. The mandatory H0 gate does not pass
on this build because trusted hooks/`PLUGIN_DATA`, full fork-mode coverage and
the managed-worktree target checkpoint are incomplete. Architecture review and
a fresh Codex re-probe are required before PH-01.

No private API, transcript event bus, release, push, PR, benchmark or PH-01
implementation was added. Exact evidence is under `spikes/ph00/evidence`.
