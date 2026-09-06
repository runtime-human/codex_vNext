# P09-P11 CLI, trace, diagnostic and memory snapshot

The official changelog and npm registry both reported CLI `0.153.4`; the
installed binary returned `codex-cli 0.153.4` on 2026-09-06.

Fresh `codex exec --json` exposed `thread.started`, `turn.started`,
`item.started`, `item.completed`, `turn.completed` and `error`. The documented
`turn.completed.usage` fields were observed, including `input_tokens`,
`cached_input_tokens`, `cache_write_input_tokens`, `output_tokens` and
`reasoning_output_tokens`. Cached input is a subset of input.

One 0.153.4 Skill + MCP run completed with input `113166`, cached input `54784`,
output `262`, and reasoning output `72`. Effective provider model and public
descendant relationship or child-only usage were not emitted, so public
descendant attribution is `PARTIAL`.

The clean-room `scripts/session-diagnostic.mjs` reads only guarded metadata and
token fields and labels every result `NON_CONTRACTUAL_DIAGNOSTIC`. Against one
real child it observed:

```text
thread_id=01a077c0-2dd0-7f40-a553-9729b049b704
parent_thread_id=01a06848-336c-7543-92c3-7df1a2313b0c
agent_role=ph00-reader
model=gpt-5.6-luna
input=193349 cached=189184 output=259 reasoning=122 total=193608
```

The public surface did not expose the same child identity/usage tuple, so no
family-total or savings claim is allowed. Unknown schema fails closed. The
supported `--disable memories` control previously returned exactly
`PH00_MEMORY_OFF_OK`; correctness does not depend on ambient memory.
