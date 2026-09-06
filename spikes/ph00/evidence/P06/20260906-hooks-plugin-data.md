# P06 hooks / PLUGIN_DATA live result

Target: Windows 11, Codex CLI `0.153.4`, plugin `0.1.7`.

`/hooks` showed the PH-00 `PreToolUse` hook as installed, active, enabled and
trusted. The current official docs describe `PLUGIN_ROOT`, `PLUGIN_DATA`, regex
matchers, `commandWindows`, synchronous guards and asynchronous hooks.

Local checks passed:

- Node test suite: 3/3;
- Windows `cmd /C` wrapper with ordinary and `\\?\` paths;
- model/UI payload boundary;
- exact synthetic deny remains independent of persistence.

Live runtime result is `PARTIAL`:

- ordinary trusted hook invocations exited with code 1;
- no live lifecycle event was appended;
- direct reproduction exposed `EPERM` on the official plugin-data file;
- its ACL gives `CodexSandboxUsers` only `ReadAndExecute`;
- live exact `PH00_BLOCK_ME` attempts executed instead of being denied, even
  after the observed Unified Exec name `exec` was included in the matcher.

The existing single JSONL event was a manual reproduction and is not counted
as live lifecycle evidence. No fallback write into the repository or private
event bus was added. Architecture branch `BR-H0-09` applies.
