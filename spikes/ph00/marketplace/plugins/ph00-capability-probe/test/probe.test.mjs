import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PUBLIC_NONCE, STATUS, UI_NONCE, renderResult, statusResult } from "../dist/src/mcp-server.js";
import { containsExact, record } from "../scripts/hook-recorder.mjs";

test("PH-00 probe contracts stay deterministic and redacted", () => {
  assert.deepEqual(statusResult().structuredContent, STATUS);
  const rendered = renderResult(STATUS);
  assert.equal(rendered.structuredContent.visible_to_model, PUBLIC_NONCE);
  assert.equal(rendered._meta.ui_only_secret_test, UI_NONCE);
  assert.equal(JSON.stringify(rendered.structuredContent).includes(UI_NONCE), false);
  assert.equal(containsExact({ command: "PH00_BLOCK_ME" }, "PH00_BLOCK_ME"), true);
  assert.equal(containsExact('tools.exec_command({cmd:"PH00_BLOCK_ME"})', "PH00_BLOCK_ME"), true);
  assert.equal(containsExact({ command: "echo PH00_BLOCK_ME" }, "PH00_BLOCK_ME"), false);
  const data = mkdtempSync(join(tmpdir(), "ph00-"));
  record({ hook_event_name: "PreToolUse", tool_input: { secret: "not-recorded" } }, { PLUGIN_ROOT: "fixture", PLUGIN_DATA: data });
  const line = readFileSync(join(data, "ph00-events.jsonl"), "utf8");
  assert.equal(line.includes("not-recorded"), false);
  assert.equal(JSON.parse(line).hook_event_name, "PreToolUse");
});

test("Windows hook command survives the Codex cmd /C wrapper", { skip: process.platform !== "win32" }, () => {
  const hooks = JSON.parse(readFileSync(new URL("../hooks/hooks.json", import.meta.url), "utf8"));
  const command = hooks.hooks.PreToolUse[0].hooks[0].commandWindows;
  const root = new URL("..", import.meta.url).pathname.slice(1).replaceAll("/", "\\");

  for (const namespaced of [false, true]) {
    const data = mkdtempSync(join(tmpdir(), "ph00-hook-"));
    const pluginRoot = namespaced ? `\\\\?\\${root}` : root;
    const pluginData = namespaced ? `\\\\?\\${data}` : data;
    const result = spawnSync(process.env.ComSpec ?? "cmd.exe", ["/C", `"${command}"`], {
      env: { ...process.env, PLUGIN_ROOT: pluginRoot, PLUGIN_DATA: pluginData },
      input: JSON.stringify({ hook_event_name: "PreToolUse" }),
      encoding: "utf8",
      windowsVerbatimArguments: true
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(readFileSync(join(data, "ph00-events.jsonl"), "utf8")).plugin_data_set, true);
  }
});

test("synthetic deny does not depend on PLUGIN_DATA persistence", () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("../scripts/hook-recorder.mjs", import.meta.url))], {
    env: { ...process.env, PLUGIN_DATA: "" },
    input: JSON.stringify({ hook_event_name: "PreToolUse", tool_input: { command: "PH00_BLOCK_ME" } }),
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, "deny");
});
