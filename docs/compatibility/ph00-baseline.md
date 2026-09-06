# PH-00 compatibility baseline

Evidence date: 2026-09-06.

- Windows 11 build 26200.
- Desktop 26.901.1978.0 tested; latest-stable status not proven by PH-00.
- CLI 0.153.4.
- Plugin/Skills/MCP read contract passed.
- Inline/fullscreen/follow-up passed; `_meta` is not a production guarantee.
- Windows hooks are degraded; hook `PLUGIN_DATA` write failed EPERM.
- Explicit `fork_turns=none` worker subset passed task/result 3/3, delta follow-up and two siblings.
- Descendant public token attribution is partial.
- Sidebar is unsupported publicly for V1.

Before PH-02 run the targeted MCP `${PLUGIN_DATA}` storage probe defined by Roadmap TP-02A.
