# P08 native Desktop development surfaces

Official Codex documentation confirms native worktree, local-environment,
review and integrated-terminal product surfaces. The repository therefore does
not implement a custom worktree manager, review UI or terminal.

This task did not create a separate managed Codex task/worktree because the
current host API requires an explicit user request for a new task. No private
`$CODEX_HOME/worktrees` control was used. Target-build managed handoff and
`.worktreeinclude` behavior remain `MANUAL_GAP`; the architectural boundary is
`PUBLIC_CONFIRMED` from official docs.
