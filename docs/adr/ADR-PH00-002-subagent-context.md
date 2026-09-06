# ADR-PH00-002: Subagent context

Status: accepted for PH-00; recheck after Codex tool-contract changes.

## Decision

Use only explicit `fork_turns=none` for Workflow Next fresh workers. The live
matrix delivered three exact tasks, a delta follow-up and two isolated parallel
siblings. A `fork_turns=1` probe did not expose the earlier parent marker.

Omitted/default and `all` are unavailable because the current model-visible
tool contract prohibits full-history forks. Do not infer their behavior from
upstream source or older builds. Task Capsule remains semantic authority.

Custom roles may request model, effort and sandbox, but effective provider
model was not public telemetry. The tested child inherited the PH-00 MCP tool;
nested collaboration controls were absent.
