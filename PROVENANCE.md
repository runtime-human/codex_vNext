# Provenance

## Clean-room rule

Workflow Next may independently implement architectural ideas observed in external projects. Do not copy prompt text, source code, templates or installer/runtime files unless a compatible license is explicitly verified.

## PH-00 baseline

Test dates: 2026-09-03 through 2026-09-06. No upstream source code was copied
into this repository. Final live checks used Codex CLI `0.153.4`.
All implementation is clean-room from public product documentation and live
behavior on the target installation.

| Source | Frozen ref | License signal | PH-00 use |
|---|---|---|---|
| `viettran-edgeAI/codex_workflow` experiment v1.1.14 | `a224f32c423ef56be322de160d5440bba0a786b2` | no compatible license verified | architecture/eval hypotheses only; do not copy |
| `viettran-edgeAI/codex_workflow` main | `e6c899ffd82d7d32aa9f93f0986a402add47c32d` | GitHub license API: none | ideas only; do not copy |
| `viettran-edgeAI/codex_workflow` `experiment/beta-install-prompt` | `c767557d28bb145c356e088cc257d7e227492902` | GitHub license API: none | ideas only; do not copy |
| `WangWilly/codex_workflow` main | `a5039c93b1e77a92be60472c2a43a6409dbf4dde` | GitHub license API: none | comparison only |
| `dev-yoshitani/codex_workflow` main | `0cdcfbb577b1c5218cd60d4d6249f72832dad7d8` | GitHub license API: `NOASSERTION` | comparison only |
| `Aerox912/codex_workflow` main | `0f98f81397740c300c12fdba380bfa6febc3b1cc` | GitHub license API: none | comparison only |

Public OpenAI contracts used by PH-00:

- <https://learn.chatgpt.com/docs/changelog>
- <https://learn.chatgpt.com/docs/plugins>
- <https://learn.chatgpt.com/docs/build-plugins>
- <https://learn.chatgpt.com/docs/hooks>
- <https://learn.chatgpt.com/docs/agent-configuration/subagents>
- <https://learn.chatgpt.com/docs/environments/git-worktrees>
- <https://learn.chatgpt.com/docs/environments/local-environment>
- <https://learn.chatgpt.com/docs/code-review>
- <https://learn.chatgpt.com/docs/integrated-terminal>
- <https://learn.chatgpt.com/docs/non-interactive-mode>
- <https://developers.openai.com/plugins/build/mcp-server>
- <https://developers.openai.com/plugins/build/chatgpt-ui>
- <https://developers.openai.com/plugins/reference>

Unknown or absent license metadata means no copying or derivative reuse. Git
history baseline is `e42bb6b`; PH-00 executes on
`spike/ph00-codex-capabilities`.

## PH-01

PH-01 contains independently written schemas, Skills and tests. Public OpenAI Codex documentation and the `openai/codex` repository may be consulted to understand host/plugin contracts; PH-01 copies no external code.
