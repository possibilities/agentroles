# 0006: Keep role delivery on the direct CLI controls

Accepted 2026-09-24. Narrows [ADR 0001](0001-roles-are-directories-delivered-by-argv.md)
and [ADR 0002](0002-explicit-roles-own-their-resources.md).

October 20, 2026: AgentStart switched its terminal Codex binding to the official
installation. AgentRoles' direct native CLI controls require no fork. The Codex
fork context below is historical. Fx delivery was subsequently retired by
[ADR 0010](0010-retire-fork-only-fx-delivery.md); its original reasoning remains below.

The codexnk fork's invocation axes (`--identity`, `--capabilities`,
`--history-dir`) and input middleware exist on the app-server, not the Codex
CLI. AgentRoles still launches the CLI through PATH with its prompt and MCP
`-c` overrides and an inert installed skills plugin enabled for that process.
Codex selects embedded mode when these non-daemon-compatible CLI overrides
are present, so an existing shared daemon cannot swallow the role. AgentRoles
does not translate the role directory into a separate app-server capability
directory or take over identity and history.

The fxnk fork's `--shape` convention reads `.fx/SYSTEM.md`, `.fx/skills` and
`.fx/mcp.json` from a shape root. The role directory has a different native
contract, so AgentRoles keeps direct Fx prompt, MCP and skill flags instead of
rendering a second shape layout. It supplies `--no-default-skills` for any role
with at least one resource, including prompt- and MCP-only roles, to exclude
ambient profile/workspace/compatibility skills. An empty role is a pass-through.
Fx's identity, history, tools, permissions, state and project-instruction flags
remain explicit caller controls.

AgentVoice is no longer a launch target. Its `VOICE_*` files are not part of a
role and are not loaded or validated. Existing files in a role directory are
left untouched, as are AgentVoice's independent direct-launch facilities.
