import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PUBLIC_NONCE, STATUS, UI_NONCE, renderResult, statusResult } from "../dist/src/mcp-server.js";
import { containsExact, record } from "../scripts/hook-recorder.mjs";

test("PH-00 probe contracts stay deterministic and redacted", () => {
  assert.deepEqual(statusResult().structuredContent, STATUS);
  const rendered = renderResult(STATUS);
  assert.equal(rendered.structuredContent.visible_to_model, PUBLIC_NONCE);
  assert.equal(rendered._meta.ui_only_secret_test, UI_NONCE);
  assert.equal(JSON.stringify(rendered.structuredContent).includes(UI_NONCE), false);
  assert.equal(containsExact({ command: "PH00_BLOCK_ME" }, "PH00_BLOCK_ME"), true);
  assert.equal(containsExact({ command: "echo PH00_BLOCK_ME" }, "PH00_BLOCK_ME"), false);
  const data = mkdtempSync(join(tmpdir(), "ph00-"));
  record({ hook_event_name: "PreToolUse", tool_input: { secret: "not-recorded" } }, { PLUGIN_ROOT: "fixture", PLUGIN_DATA: data });
  const line = readFileSync(join(data, "ph00-events.jsonl"), "utf8");
  assert.equal(line.includes("not-recorded"), false);
  assert.equal(JSON.parse(line).hook_event_name, "PreToolUse");
});
