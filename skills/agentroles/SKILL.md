---
name: agentroles
description: Run Claude Code, Codex, Fx or OpenCode under a named role with the agentroles CLI — a directory of skills, MCP servers, prompt files and Claude monitors applied to one invocation only. Use when a task should run "as the researcher role", when someone asks to give an agent skills, MCP servers or Claude plugin monitors without changing global configuration, or when creating or inspecting a role directory.
---

# agentroles

`agentroles <role> -- <claude|codex|fx|opencode> [args…]` runs the
harness with the role's skills, MCP servers, prompt files and Claude monitors,
and nothing else changed.
`agentroles list` names the roles under `~/.config/agentroles` (or
`$AGENTROLES_HOME`); `agentroles show <role>` prints what each harness would
receive without launching anything.

A role directory holds any of: `SYSTEM_PROMPT.md` or `APPEND_SYSTEM_PROMPT.md`
(one, not both), `skills/<name>/SKILL.md`, `mcp.json` in `.mcp.json` shape, and
`monitors.json`, Claude's native strict array of `{name, command, description,
when?}`. `when` is `always` (default) or `on-skill-invoke:<skill>`. Monitors reach
only Claude's session plugin: interactive sessions with the Monitor tool
enabled, not `-p`; other harnesses and Devin installs ignore them. Commands and
native `${HOME}` / `${CLAUDE_PLUGIN_ROOT}` references are not rewritten.
Create one by making the directory; there is
no init command.

Each run gives the harness and its subprocesses a fresh
`AGENTROLES_INVOCATION_ID` UUID and `AGENTROLES_HARNESS`; nested runs get their
own values. These correlate one invocation, not a durable session/account.
`show` and `install` allocate no ID. OpenCode requires V2;
`agentroles <role> -- opencode acp` uses ACP's intrinsic private server with the same role config and
append plugin. TUI, `run` and `mini` use `--standalone`; `attach`, `--server`
and utility commands cannot receive a nonempty process-local role.

Codex CLI skills need `agentroles install <role>` once per role and again
after editing its skills. Before deciding whether to reinstall, run
`agentroles install --check <role>`: it performs a read-only comparison and
prints JSON; exit 0 means the installed copy is fresh, and exit 1 means it is
absent or stale. Claude Code, Fx and OpenCode need no install. The
harness's exit code is returned unchanged. The full contract is the agentroles
README.
