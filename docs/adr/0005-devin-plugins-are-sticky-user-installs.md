# 0005: Devin plugins are sticky user installs

Accepted 2026-09-23.

Devin CLI 3000.11.1 has no per-invocation control for a system prompt, skill
root, MCP config file, or plugin enablement. `--config` only replaces the user
`config.json`. Skills and MCP live in fixed user/project files. `devin plugins
install --local` writes user-level plugin state that applies to every later
session on the machine.

Per-process delivery of a role to `devin` was rejected: it would require an
agentroles overlay (a synthetic `HOME` / `XDG_*` tree, including the login in
`credentials.toml`) or a global plugin leak. That is outside
[ADR 0001](0001-roles-are-directories-delivered-by-argv.md).

`agentroles install --devin <role>` is the supported Devin path. It renders
`~/.cache/agentroles/devin/<name>/` in Devin's plugin layout and runs Devin's
own CLI:

- `.devin-plugin/plugin.json` names the role
- `SYSTEM_PROMPT.md` or `APPEND_SYSTEM_PROMPT.md` becomes `AGENTS.md` (always-on;
  it cannot replace Devin's base prompt)
- `skills/` is copied
- `mcp.json` is copied as `.mcp.json`

The plugin stays enabled for every Devin session until `devin plugins remove`.
Re-run the command after editing the role; the cache directory is regenerated
and `--local` links that same path. This writes Devin state, the way
`agentroles install` writes Codex state, and it is not process-local.

`devin` is not a launch harness. There is no `agentroles <role> -- devin`.
