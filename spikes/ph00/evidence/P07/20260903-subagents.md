# P07 subagent/context snapshot

Synthetic parent nonce: `PH00_PARENT_NONCE_7C4E2A91`.

Observed through the current host's public collaboration surface:

- a child spawned with task-only context (`fork_turns=none`) reported
  `parent_nonce=ABSENT` and `context_source=task-only`;
- two independent result-delivery probes returned `PH00_CHILD_OK_A` and
  `PH00_CHILD_OK_B`;
- a child asked to create one descendant reported
  `descendant_spawn=UNSUPPORTED` because its tool surface had no spawn tool.

Observed through fresh CLI `codex exec`:

- project profile `.codex/agents/ph00-reader.toml` was selected;
- the child read only the supplied fixture and returned
  `PROFILE=reader;NONCE=ABSENT`;
- root usage was input `73194`, cached input `46592`, output `148`, reasoning
  output `22`.

The public CLI JSONL showed a `collab_tool_call` wait but no receiver thread
ID, parent/child relationship, child model, child-only timing, or child-only
usage. The effective provider model was not reported. Therefore:

- task-only context control: `PUBLIC_CONTEXT_CONTROL_PARTIAL` for this host;
- configured profile/model/effort: confirmed as requested configuration only;
- result delivery: confirmed twice for bounded probes;
- descendant spawn: unavailable in the tested child surface, not a global
  depth guarantee;
- descendant attribution: `PARTIAL`.

No claim of token savings is allowed from these observations.
