# ADR-PH00-004: Subagent reliability

Status: accepted for PH-00.

## Classification

`PUBLIC_BOUNDED_CONTEXT_PARTIAL` overall.

## Production allow/deny rule

Allow explicit `fork_turns=none`, self-contained read-only task envelopes,
bounded waits, follow-up deltas and the tested two-sibling shape. Initial task
and result delivery passed 3/3; follow-up and both sibling deliveries passed;
the child inherited the configured PH-00 MCP tool.

Deny reliance on omitted/default or `all`, nested delegation, hidden effective
model attribution, implicit parent context, or platform maximum as concurrency
policy. Main owns bounded recovery; no infinite retry loop is permitted.
