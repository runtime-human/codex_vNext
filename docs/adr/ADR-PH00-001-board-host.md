# ADR-PH00-001: Board host

Status: accepted for PH-00 evidence.

## Decision

Use separate MCP data and render tools. Codex Desktop inline card to fullscreen
is the canonical Board host. PiP and modal are optional capabilities, never
requirements. Text/tool output remains the fallback; do not create a
standalone app.

The tested target did not deliver render-result `_meta` to the component and a
fullscreen transition did not preserve the nonce fields. Production state and
authorization must therefore come from explicit MCP calls and model-visible
structured data, not `_meta` or transient component state.

No public third-party persistent sidebar contract was found, so sidebar is
not a V1 dependency.
