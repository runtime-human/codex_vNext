# P05 Codex Desktop UI evidence

Target task: `01a0687d-a146-7e02-a3e0-29a09b561b6f` (`Check ph00 status`).

Public task history confirms:

- the installed `ph00-status` Skill was read from the PH-00 plugin cache;
- `ph00_get_status` completed and returned
  `{"phase":"PH-00","status":"probe","counter":1}`;
- `ph00_render_status` completed with the data-tool result;
- the final structured result exposed `PH00_PUBLIC_NONCE` to the model.

The four supplied screenshots confirm:

- an inline MCP component rendered in Codex Desktop;
- the component showed status `PH-00 / probe / 1`;
- inline `Model nonce` showed `PH00_PUBLIC_NONCE`;
- `UI-only nonce` showed `missing`: the target host did not deliver the
  render-result `_meta` through the compatibility path tested;
- fullscreen opened successfully; its recreated view retained status but
  showed both nonce fields as `missing` in the captured state;
- Follow up opened a user-confirmation dialog, then produced the follow-up
  user message and assistant response in the same task.

Not established by the supplied evidence: component-originated tool-call
success, PiP, and the custom Modal button.

Artifacts:

- `20260903-desktop-inline.png`
- `20260903-desktop-fullscreen.png`
- `20260903-desktop-follow-up-confirmation.png`
- `20260903-desktop-follow-up-result.png`

Classification:

- inline UI: `PUBLIC_CONFIRMED` on Desktop `26.901.1978.0`;
- fullscreen: `PUBLIC_CONFIRMED_WITH_STATE_GAP`;
- UI follow-up: `PUBLIC_CONFIRMED_WITH_USER_CONFIRMATION`;
- render-result `_meta`: `PUBLIC_UNAVAILABLE_ON_TARGET_PATH`;
- PiP/modal/UI tool call: `UNKNOWN_PENDING_TARGET_CHECK`.
