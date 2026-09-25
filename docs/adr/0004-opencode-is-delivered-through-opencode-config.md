# 0004: OpenCode is delivered through OPENCODE_CONFIG

Accepted 2026-09-23.
The V1-specific field mapping and fixed cache path below are superseded by
[ADR 0007](0007-deliver-roles-to-both-opencode-majors.md). V1 remains supported.

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
- `skills/` → `skills.paths: [<absolute skills root>]`, left in place, and each
  `SKILL.md` as `command.<name>` (`template` is the markdown body plus the skill
  directory, `description` from frontmatter). OpenCode also registers skills as
  commands internally, but the TUI slash menu skips `source === "skill"`, so
  `/collab` only appears when it is a native `command` entry.
- `mcp.json` → `mcp`: `command` becomes `{type:"local", command:[cmd,...args]}`,
  `url` becomes `{type:"remote", url}`; `sse` is delivered as `remote`

No AgentLaunch resource marker: OpenCode is not launched through AgentLaunch.
No `agentroles install` path: skills are not copied into OpenCode state.

Limits that follow from OpenCode itself: project `opencode.json` can override
role keys; global/project/external skills still load; replacing `build.prompt`
does not change `plan` or `explore`. A project `command` of the same name
overrides the role skill's slash entry.
