import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const usageFields = ["input_tokens", "cached_input_tokens", "output_tokens", "reasoning_output_tokens", "total_tokens"];

export function inspectSession(file) {
  let meta;
  let model;
  let usage;

  for (const line of readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean)) {
    const event = JSON.parse(line);
    if (event.type === "session_meta") meta = event.payload;
    if (event.type === "turn_context" && typeof event.payload?.model === "string") model = event.payload.model;
    if (event.type === "event_msg" && event.payload?.type === "token_count") usage = event.payload.info?.total_token_usage;
  }

  if (!meta?.id || !meta?.cli_version || !usage || usageFields.some((field) => typeof usage[field] !== "number")) {
    throw new Error("unknown or incomplete Codex session schema");
  }

  return {
    source: "NON_CONTRACTUAL_DIAGNOSTIC",
    codex_version: meta.cli_version,
    schema_observed: "session_meta + turn_context + event_msg.token_count.info.total_token_usage",
    thread_id: meta.id,
    parent_thread_id: meta.parent_thread_id ?? null,
    thread_source: meta.thread_source ?? null,
    agent_role: meta.agent_role ?? null,
    model: model ?? null,
    usage: Object.fromEntries(usageFields.map((field) => [field, usage[field]]))
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.stdout.write(`${JSON.stringify(inspectSession(process.argv[2]), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
