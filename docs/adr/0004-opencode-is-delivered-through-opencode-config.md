# 0004: OpenCode is delivered through OPENCODE_CONFIG

Accepted 2026-09-23.

OpenCode CLI has no argv for a system prompt, skill root or MCP config file.
Its documented per-process control is `OPENCODE_CONFIG` pointing at additional
JSON, which OpenCode merges with global and project config. agentroles renders
that JSON under `~/.cache/agentroles/opencode/<name>/opencode.json` on every
launch and sets the env var for the child. User tokens are unchanged.

This is the same class of native-control rendering as Claude's cache plugin
directory and Codex's `-c` overrides, not an agentroles-shaped overlay.
`OPENCODE_CONFIG_DIR` was rejected: OpenCode writes a `.gitignore` and runs
`npm install` in every config directory.

File mapping:

- `SYSTEM_PROMPT.md` → `agent.build.prompt` (OpenCode's default primary agent)
- `APPEND_SYSTEM_PROMPT.md` → `instructions: [<absolute path>]`
- `skills/` → `skills.paths: [<absolute skills root>]`, left in place
- `mcp.json` → `mcp`: `command` becomes `{type:"local", command:[cmd,...args]}`,
  `url` becomes `{type:"remote", url}`; `sse` is delivered as `remote`

No AgentLaunch resource marker: OpenCode is not launched through AgentLaunch.
No `agentroles install` path: skills are not copied into OpenCode state.

Limits that follow from OpenCode itself: project `opencode.json` can override
role keys; global/project/external skills still load; replacing `build.prompt`
does not change `plan` or `explore`.
