# P07 subagent/context and reliability snapshot

Target: Codex Desktop collaboration surface, CLI `0.153.4`, 2026-09-06.

| Shape | Observed result |
|---|---|
| `fork_turns=none` context | parent marker absent |
| `fork_turns=none` task delivery | 3/3 exact: `R1_7C2A`, `R2_91DF`, `R3_4BE8` |
| follow-up/delta | exact `TASK_UPDATED R2_91DF` |
| parallel siblings | both exact; no reported cross-token contamination |
| `fork_turns=1` | task delivered; parent marker absent in this long-parent probe |
| omitted/default | `UNAVAILABLE`: current tool contract defaults to prohibited full-history fork |
| `fork_turns=all` | `UNAVAILABLE`: current tool contract explicitly prohibits full-history fork |
| custom role | `ph00-reader` discovered and used |
| effective model/effort | configured role observed; effective provider model not exposed publicly |
| MCP inheritance | child called `ph00_get_status`; exact `MCP_VISIBLE PH-00 probe 1` |
| nested delegation | `NESTED_UNAVAILABLE collaboration tools absent` |
| capacity | host contract advertised 20 concurrent slots; not a production policy target |

Waits were bounded and every spawned task returned a final result. The tested
parallel batch returned `SIBLING_DONE A_ONLY_6F31` and
`SIBLING_DONE B_ONLY_DA84`. No timeout or shutdown-only result occurred.

Classification: `PUBLIC_BOUNDED_CONTEXT_PARTIAL`. The reliable production-safe
subset is explicit `fork_turns=none` with a self-contained task. Full-history
semantics and effective model attribution are not available in the current
public/model-visible tool contract, so they are not inferred.

This is a semantics/reliability probe, not a token-savings benchmark.
