# Workflow Next PH-00 compatibility

Status: automated evidence current; Desktop checkpoint pending.

| Field | Result |
|---|---|
| Test date | 2026-09-03 |
| OS | Windows 11 build 26200 |
| Desktop | `26.901.1978.0`; latest/update UI confirmation pending |
| CLI | `0.153.0`, updated and live-tested |
| Account/plan | signed-in target account; Plus UI confirmation pending |
| Models/efforts | CLI host advertises Sol/Terra/Luna; explicit Luna/low passed; Desktop picker pending |
| Plugin packaging | local marketplace plugin installed/enabled in real profile |
| Skill lifecycle | validator pass; fresh CLI and Desktop new-task invocation pass |
| MCP | deterministic read tool and separate render tool pass SDK/CLI live tests |
| UI modes | Desktop inline pass; fullscreen opens with a state gap; follow-up passes with confirmation; PiP/modal/UI tool call pending |
| UI data boundary | model receives `PH00_PUBLIC_NONCE`; component render-result `_meta` was missing on the target path |
| Hooks | deterministic redacted recorder pass; no real `PLUGIN_DATA` event file after the UI task, so trust/runtime proof remains pending |
| `PLUGIN_DATA` | direct script test pass; Desktop persistence pending |
| Agents/context | task-only child omitted parent nonce; custom reader profile passed; effective model not public |
| Worktrees/local env | public native contract confirmed; target Desktop fixture pending |
| Review/terminal | public native contract confirmed; target Desktop smoke pending |
| CLI native controls | plugin, agents, queue, doctor, exec, review present |
| Trace schema | completed usage present; failed usage absent; effective model absent |
| Descendant attribution | `PARTIAL` |
| Memories | correctness passes with `--disable memories` |
| Sidebar | `UNSUPPORTED_PUBLIC` |
| Known degraded behavior | existing dotnet plugin manifest/icon warnings; PowerShell shell snapshot warning; OpenViking shutdown warning; no PH-00 workaround added |
