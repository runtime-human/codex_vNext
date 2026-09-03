# P09-P11 CLI, trace, and memory snapshot

CLI `0.153.0` exposes native `plugin`, `agents`, `queue`, `doctor`, `exec`, and
`review` commands. The real profile sees the installed PH-00 marketplace and
plugin. CLI Skill/MCP parity passed as recorded under P02-P06.

Fresh `codex exec --json` event types observed:

```text
thread.started
turn.started
item.started
item.completed
turn.completed
turn.failed
error
```

Completed usage fields:

```text
input_tokens
cached_input_tokens
cache_write_input_tokens
output_tokens
reasoning_output_tokens
```

`cached_input_tokens` is treated as a subset of input, never added again.
JSONL did not report an effective provider model ID. A controlled invalid
reasoning-effort value ended with `turn.failed` and no usage, so incomplete
turn usage is `partial/unknown`, never zero.

The supported `--disable memories` control was tested with explicit requested
`gpt-5.6-luna` / `low`. It returned exactly `PH00_MEMORY_OFF_OK`; usage was
input `24228`, cached input `0`, output `9`, reasoning output `0`. Plugin
correctness therefore does not depend on ambient memory.
