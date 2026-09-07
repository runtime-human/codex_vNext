# ADR-PH02-001: Use Agent Plugins v1 for persistent MCP storage

## Status

Accepted on 2026-09-08.

## Context

The legacy Codex plugin manifest plus `.mcp.json` loaded the TP-02A MCP server,
but its process did not receive `PLUGIN_DATA`. PH-02 forbids a home, repository,
or application-data fallback.

Current Codex source has a separate Agent Plugins v1 MCP parser. For root
`plugin.json` plus root `mcp.json`, Codex creates the plugin data root, injects
`PLUGIN_ROOT` and `PLUGIN_DATA`, expands their placeholders, and prevents the
plugin from overriding either reserved variable.

## Decision

Workflow Next uses the Agent Plugins v1 package format:

- root `plugin.json` with the published 1.0.0 schema;
- root `mcp.json` with the published 1.0.0 MCP schema;
- SQLite state only below host-provided `PLUGIN_DATA`;
- no storage fallback.

The existing Codex-specific manifest is replaced when the production MCP ships.
Hooks remain degraded because the current Codex loader does not load plugin hooks
for Agent Plugin packages. PH-02 correctness continues to use explicit MCP state.

## Evidence

Two independent Codex CLI 0.153.4 processes ran the Agent Plugin TP-02A probe.
The first passed file and SQLite write/reopen checks; the second passed restart
persistence with the same nonce. Probe-owned data was then removed successfully.

Machine-readable evidence is `evidence/ph02-storage-probe.json`.

## Sources

- <https://github.com/openai/codex/blob/main/codex-rs/codex-mcp/src/agent_plugin_config.rs>
- <https://github.com/openai/codex/blob/main/codex-rs/core-plugins/src/loader.rs>
- <https://agent-plugins.org/schemas/1.0.0/plugin.schema.json>
- <https://agent-plugins.org/schemas/1.0.0/mcp.schema.json>
