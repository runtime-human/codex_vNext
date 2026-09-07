---
name: ph00-status
description: Run the disposable PH-00 capability probe when asked to verify current Codex plugin, MCP, UI, or hook behavior.
---

Call `ph00_get_status` first. Report its exact structured result.

Call `ph00_render_status` only when the user asks to inspect the embedded UI. Treat missing UI, display modes, modal, follow-up, or hook events as observed capability limits, not reasons to use private APIs or hidden flags.
