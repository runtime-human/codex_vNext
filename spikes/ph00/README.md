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

Current automated result: plugin/Skill/MCP and CLI parity pass; subagent and
trace behavior are classified in evidence. Desktop UI, hook trust,
managed-worktree, review, terminal, and account-picker observations remain a
manual target-host checkpoint.
