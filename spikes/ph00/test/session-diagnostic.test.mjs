import assert from "node:assert/strict";
import test from "node:test";
import { inspectSession } from "../scripts/session-diagnostic.mjs";

test("session diagnostic exposes only guarded metadata and usage", () => {
  const result = inspectSession(new URL("../fixtures/session-diagnostic/sample.jsonl", import.meta.url));
  assert.deepEqual(result, {
    source: "NON_CONTRACTUAL_DIAGNOSTIC",
    codex_version: "0.153.4",
    schema_observed: "session_meta + turn_context + event_msg.token_count.info.total_token_usage",
    thread_id: "child-1",
    parent_thread_id: "parent-1",
    thread_source: "subagent",
    agent_role: "ph00-reader",
    model: "gpt-5.6-luna",
    usage: { input_tokens: 12, cached_input_tokens: 8, output_tokens: 3, reasoning_output_tokens: 1, total_tokens: 15 }
  });
});
