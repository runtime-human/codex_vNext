# ADR-PH00-003: Trace attribution

Status: accepted for PH-00.

## Decision

Use documented `codex exec --json` events and `turn.completed.usage` for root
automation traces. Treat `cached_input_tokens` as a subset of input. Missing
failed/interrupted usage, effective model, child ID, parent relation or
child-only usage remains unknown, never zero.

Descendant attribution is `PARTIAL`. The clean-room local parser is explicitly
`NON_CONTRACTUAL_DIAGNOSTIC`, guards the observed schema and exposes only
session metadata plus token totals. It proved local parent/child ancestry and
usage that the public surface did not expose, but it is not a correctness or
product dependency.

Total family-token savings remain prohibited until an official complete
attribution surface exists. Headless and Desktop multi-agent reliability stay
separate evidence classes.
