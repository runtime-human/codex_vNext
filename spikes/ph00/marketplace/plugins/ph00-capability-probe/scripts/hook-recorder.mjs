import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

export function containsExact(value, expected) {
  if (value === expected || (typeof value === "string" && (value.includes(`"${expected}"`) || value.includes(`'${expected}'`)))) return true;
  if (Array.isArray(value)) return value.some((item) => containsExact(item, expected));
  return value && typeof value === "object"
    ? Object.values(value).some((item) => containsExact(item, expected))
    : false;
}

export function summarize(input, env = process.env) {
  return {
    event_id: `PH00-${Date.now()}-${process.pid}`,
    hook_event_name: input.hook_event_name ?? "unknown",
    source: input.source ?? null,
    reason: input.reason ?? null,
    tool_name: input.tool_name ?? null,
    agent_type: input.agent_type ?? null,
    permission_mode: input.permission_mode ?? null,
    plugin_root_set: Boolean(env.PLUGIN_ROOT),
    plugin_data_set: Boolean(env.PLUGIN_DATA)
  };
}

export function record(input, env = process.env) {
  if (!env.PLUGIN_DATA) throw new Error("PLUGIN_DATA is not set");
  const data = env.PLUGIN_DATA.startsWith("\\\\?\\") ? env.PLUGIN_DATA.slice(4) : env.PLUGIN_DATA;
  const file = join(data, "ph00-events.jsonl");
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, `${JSON.stringify(summarize(input, env))}\n`, "utf8");
}

async function main() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  const input = JSON.parse(raw || "{}");
  if (input.hook_event_name === "PreToolUse" && containsExact(input.tool_input, "PH00_BLOCK_ME")) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: "PH-00 synthetic policy proof"
      }
    }));
    return;
  }
  record(input);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
