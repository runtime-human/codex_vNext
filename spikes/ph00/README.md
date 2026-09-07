# PH-00 capability spike

This directory is disposable implementation plus durable evidence for H0. It
does not contain Workflow Next production state, orchestration, Board, or CLI.

Run the deterministic local checks from the plugin directory:

```powershell
npm test
```

The local marketplace package is
`marketplace/plugins/ph00-capability-probe`. Runtime dependencies, generated
build output, hook data, and managed worktrees are ignored or removed during
P13 cleanup.

PH-00 execution is complete with `GATE-H0=BLOCKED`: plugin/Skill/MCP/UI and the
explicit fresh-worker subset pass, while live Windows hooks/`PLUGIN_DATA` and
the managed-worktree checkpoint remain incomplete. PH-01 was not started.
