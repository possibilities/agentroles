# 0001: Roles are directories delivered by argv

Accepted 2026-09-05.

A role is a plain directory whose files each map to one native control of the
target harness, and agentroles delivers it by rendering that harness's own
command-line arguments and running the harness through PATH. This keeps roles
independent of identity, session history and global configuration, lets fleet
shims keep their policy, and makes the format usable by hand without the tool.
`mcp.json` uses Claude Code's `.mcp.json` shape because it is the most widely
shared MCP file format; Codex receives a translation.

Codex CLI has no per-process skill root, so its skills route is a plugin that
`agentroles install` installs through Codex's plugin CLI and persists disabled
through Codex's config editor; launches enable it with `-c plugins.<id>.enabled`.
Setting `skills.config` was rejected because the AgentLaunch shim prepends its
own value for that key and a later `-c` would replace the fleet's. AgentVoice
reads the directory natively (`--role`) because only its process can call
`skills/extraRoots/set` on the child it owns.
