# PH-01 Skill smoke

Date: 2026-09-07

- Desktop build: PH-00 baseline `26.901.1978.0`; the current public task API did not expose a fresh build identifier.
- CLI version: `codex-cli 0.153.4`.
- Plugin: `codex-workflow-next@workflow-next-local` `0.1.0-alpha.1`, installed from the production Skills-only manifest through a local marketplace snapshot.

| Surface | Prompt | Expected Skill | Observed Skill | Result |
|---|---|---|---|---|
| Desktop | Decide whether this refactor should be delegated and verified | `orchestrate-work` | `codex-workflow-next:orchestrate-work` | pass |
| Desktop | Prepare a bounded assignment for a fresh builder to change auth validation | `task-envelope` | `codex-workflow-next:task-envelope` | pass |
| Desktop | Verify whether this migration is actually safe for production | `verify-work` | `codex-workflow-next:verify-work` | pass |
| Desktop | Fix the typo in README line 4 | none | none | pass |
| CLI | Decide whether this refactor should be delegated and verified | `orchestrate-work` | `codex-workflow-next:orchestrate-work` | pass |
| CLI | Prepare a bounded assignment for a fresh builder to change auth validation | `task-envelope` | `codex-workflow-next:task-envelope` | pass |
| CLI | Verify whether this migration is actually safe for production | `verify-work` | `codex-workflow-next:verify-work` | pass |
| CLI | Fix the typo in README line 4 | none | none | pass |

## Findings

- Informational: Desktop Skill reload required a fresh task, as expected by the PH-01 procedure.
- Informational: the public Desktop task API did not expose a current build identifier; Skill selection remained directly observable through public task output.
- Informational: CLI reported that the global installed-Skill description budget shortened some descriptions, but all four expected classifications still passed.
- Informational and unrelated to PH-01: CLI startup reported an existing `dotnet-msbuild` manifest warning and unavailable OpenViking MCP/analytics endpoints. The Skills-only plugin loaded and classified prompts successfully.

No private session or rollout data was inspected.
