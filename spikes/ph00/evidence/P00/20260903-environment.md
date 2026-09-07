# P00 environment snapshot

- Test date/time zone: 2026-09-03, Asia/Yekaterinburg.
- OS: Microsoft Windows NT `10.0.26200.0`.
- Codex Desktop AppX: `OpenAI.Codex 26.901.1978.0`, x64, status `Ok`.
- Codex CLI: `codex-cli 0.153.0`; global npm package
  `@openai/codex@0.153.0`.
- Node/npm: `24.19.0` / `11.17.0`.
- Git/Python: `2.55.0.windows.3` / `3.13.15`.
- Real-profile stable flags: `plugins=true`, `hooks=true`, `memories=true`,
  `multi_agent=true`, `multi_agent_v2=true`.
- `enable_mcp_apps=false` is under development and was not enabled.
- ChatGPT authentication/network passed `codex doctor`; doctor also reported
  pre-existing Defender, Dev Drive, terminal, and rollout/thread-store
  warnings. PH-00 did not change them.

The CLI was updated with:

```powershell
npm install -g @openai/codex@0.153.0
```

Desktop latest-version status and Plus/model-picker labels require the manual
Desktop checkpoint.
