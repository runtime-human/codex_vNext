# P02-P06 automated plugin evidence

Package source: `ph00-capability-probe@ph00-local`, final probe version `0.1.7`.

Live real-profile installation:

```text
Marketplace `ph00-local`
ph00-capability-probe@ph00-local  installed, enabled  0.1.7
```

Validation:

- official plugin validator: pass;
- official Skill quick validator: pass;
- `npm test`: 3 tests, pass;
- MCP SDK client initialize/list/call: pass;
- tools listed: `ph00_get_status`, `ph00_render_status`;
- exact read result: `{"phase":"PH-00","status":"probe","counter":1}`.

Contract shape:

- the data tool is read-only and useful without UI;
- render is a separate tool;
- `structuredContent.visible_to_model=PH00_PUBLIC_NONCE`;
- render-result `_meta.ui_only_secret_test=PH00_UI_NONCE` and the private value
  is absent from structured content;
- UI uses MCP Apps postMessage first and feature-detects `window.openai` for
  tool calls, follow-up, fullscreen, PiP, and modal;
- hook script writes redacted events only to `PLUGIN_DATA` and supports
  `commandWindows`;
- exact `PH00_BLOCK_ME` input is the only synthetic deny case.

Fresh CLI `0.153.4` `codex exec` loaded the packaged Skill, called
`ph00_get_status` once, and returned the exact JSON. Its completed-turn usage
was input `114366`, cached input `84992`, output `306`, reasoning output `90`.

Desktop rendering is separate evidence. Trusted live hook runtime and
`PLUGIN_DATA` persistence are `PARTIAL`; see `P06/20260906-hooks-plugin-data.md`.
