# ADR-PH00-002: Subagent context

Status: accepted for PH-00 evidence; recheck if the public host contract
changes.

## Decision

Treat Task Capsule as semantic authority, not as a universal token-isolation
guarantee. The tested task-only spawn omitted the synthetic parent nonce and a
fresh CLI custom reader did the same, but the controlling `fork_turns` surface
is a current host tool contract rather than documented general Codex behavior.

Custom profiles can request model, effort, and sandbox. Public CLI trace did
not expose the effective provider model, so evidence may say configured or
requested only. Main owns delegation; the tested child could not spawn a
descendant, but this is not used as a permanent depth guarantee.

PH-03/PH-04 economics must benchmark parent-history amplification and may not
claim that delegation alone saves tokens.
