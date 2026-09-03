# ADR-PH00-001: Board host

Status: proposed pending Desktop UI probe.

## Decision

Use separate MCP data and render tools. Prefer inline card to fullscreen only
when Codex Desktop demonstrates the public UI contract. PiP and modal are
optional capabilities, never requirements. If rich UI does not render, retain
the useful text/tool workflow and defer the Board rather than create a
standalone app.

No public third-party persistent sidebar contract was found, so sidebar is
not a V1 dependency.
