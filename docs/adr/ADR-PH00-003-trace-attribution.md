# ADR-PH00-003: Trace attribution

Status: accepted for PH-00 evidence.

## Decision

Use public `codex exec --json` as the automation trace source. Normalize the
observed completed-turn usage fields and treat `cached_input_tokens` as a
subset of input.

Effective provider model, failed/interrupted usage, child thread identity, and
child-only usage were absent from the tested public JSONL. Descendant
attribution is therefore `PARTIAL`. Missing fields remain unknown and must
never be synthesized as zero.

Later benchmarks may report root completed-turn usage, quality, elapsed time,
and public child state. Total family-token savings are prohibited until an
official complete attribution surface exists. Private rollout data may be
diagnostic only, never a production dependency or public claim source.
