---
name: agentroles
description: Run Claude Code, Codex, AgentVoice or Fx under a named role with the agentroles CLI — a directory of skills, MCP servers and prompt files applied to one invocation only. Use when a task should run "as the researcher role", when someone asks to give an agent a set of skills or MCP servers without changing global configuration, or when creating or inspecting a role directory.
---

# agentroles

`agentroles <role> -- <claude|codex|agentvoice|fx> [args…]` runs the harness with
the role's skills, MCP servers and prompt files, and nothing else changed.
`agentroles list` names the roles under `~/.config/agentroles` (or
`$AGENTROLES_HOME`); `agentroles show <role>` prints what each harness would
receive without launching anything.

A role directory holds any of: `SYSTEM_PROMPT.md` or `APPEND_SYSTEM_PROMPT.md`
(one, not both), `skills/<name>/SKILL.md`, `mcp.json` in `.mcp.json` shape, and
AgentVoice's `VOICE_*.md` files. Create one by making the directory; there is
no init command.

Codex CLI skills need `agentroles install <role>` once per role and again
after editing its skills. Before deciding whether to reinstall, run
`agentroles install --check <role>`: it performs a read-only comparison and
prints JSON; exit 0 means the installed copy is fresh, and exit 1 means it is
absent or stale. Claude Code, AgentVoice and Fx need no install. The harness's
exit code is returned unchanged. The full contract is the agentroles README.
