> *Slop Made With Sweat: Made with a lot of love by someone who loves code but read none of it.*

# agentroles

Give Claude Code, Codex or OpenCode a role for one invocation. A
role is a directory of skills, MCP servers, prompt files and Claude monitors;
`agentroles` delivers it to the harness you name by that harness's native process controls
and runs that harness. Nothing in the role touches global harness state, the
account, the workspace or session history, and two shells can run two roles
side by side.

```sh
agentroles researcher -- claude -p "Summarize the papers in ./inbox"
agentroles researcher -- codex exec "Summarize the papers in ./inbox"
agentroles researcher -- opencode run "Summarize the papers in ./inbox"
agentroles researcher -- opencode acp
```

## The role directory

A role is resolved by name under `$AGENTROLES_HOME` (default
`~/.config/agentroles`) or by path (anything containing `/`, or starting with
`.` or `~`). Names use letters, digits, `_` and `-` only, because the name
becomes a Codex config key segment and a plugin id. Every file is one native
control of the harness it reaches; there is no agentroles-specific overlay.

| File | Meaning |
| --- | --- |
| `SYSTEM_PROMPT.md` | Replaces the agent's system prompt |
| `APPEND_SYSTEM_PROMPT.md` | Appends to the agent's default system prompt |
| `skills/<name>/SKILL.md` | Skills, one directory each, with the usual `name`/`description` frontmatter |
| `mcp.json` | MCP servers in Claude Code's `.mcp.json` shape: `{"mcpServers": {"<name>": {...}}}` |
| `monitors.json` | Claude Code's native plugin monitors array |

A replacement and an append for the same agent cannot both be present; the
role fails to load. A file that exists but cannot be read (a broken link, a
directory, no permission) fails the same way, before any harness starts.
`skills/` may contain only skill directories. `mcp.json` server names follow
the role-name rule; each server has exactly one of `command` or `url`.

`monitors.json` is an array of strict objects with string `name`, `command` and
`description`, and optional `when` (`"always"`, the default, or
`"on-skill-invoke:<skill>"`). Duplicate names, unknown fields and invalid or
unreadable files fail before launch. Commands remain unchanged, including native
`${HOME}` and `${CLAUDE_PLUGIN_ROOT}` references; the latter names the rendered
plugin root, not the role directory. Claude rejects `${user_config.*}` in monitor
commands, so AgentRoles rejects those before launch too.

## What each harness receives

| Capability | Claude Code | Codex CLI | OpenCode |
| --- | --- | --- | --- |
| `SYSTEM_PROMPT.md` | `--system-prompt-file` | `-c model_instructions_file=<path>` | `agents.build.system` |
| `APPEND_SYSTEM_PROMPT.md` | `--append-system-prompt-file` | `-c developer_instructions="<text>"` (Codex's developer message after its base prompt) | per-launch plugin appends to the assembled system instructions |
| `mcp.json` | `--mcp-config <role>/mcp.json` | one `-c mcp_servers.<name>={...}` per server, `type` dropped and `headers` renamed `http_headers` (`sse` is rejected) | `mcp.servers`; local commands and remote URLs translated |
| `skills/` | `--plugin-dir` on a unique plugin under `~/.cache/agentroles/claude/<name>/launch-*/`; skills appear as `/<name>:<skill>` | `-c plugins.<name>@agentroles.enabled=true` on a plugin installed once by `agentroles install`; skills appear as `$<name>:<skill>` | `skills` and `commands.<name>` |
| `monitors.json` | `experimental.monitors` inline in that session's `--plugin-dir` manifest, even without skills | ignored | ignored |

Claude starts plugin monitors at interactive session start and plugin reload (or
the first named skill invocation with `when`); stdout lines become notifications.
They do not run with `-p` or when the Monitor tool is unavailable or disabled.
AgentRoles does not start monitors itself or emulate them on other harnesses.
See Claude's [manifest reference](https://code.claude.com/docs/en/plugins/manifest-reference#monitors)
and [runtime limits](https://code.claude.com/docs/en/plugins/components#monitors).

`opencode` must resolve to OpenCode 2; V1 and the `opencode2` command are not
supported. AgentRoles renders a unique per-launch config and append plugin and
starts a private `--standalone` server for the TUI, `run` and `mini`.
`opencode acp` already owns a private server and receives the same native role
config without an added flag; it serves ACP over stdio until stdin closes.
`attach`, `--server` and utility commands cannot deliver a role to that private
session. OpenCode exposes role skills as native slash commands. A project config
may still override role keys;
`--agent plan` selects `plan`, whose prompt is not replaced.

The harness is found on `PATH`, so installed permission shims still apply.
For direct Claude and Codex launches, the role supplies its skill and MCP
arguments; an omitted role resource is not added by AgentRoles. Codex options
go after `exec`/`review` or `resume <id>` and before other arguments. The child also receives
`AGENTROLES_ROLE=<dir>` and `AGENTROLES_NAME=<name>` in its environment, and
its exit code is agentroles' exit code.

Every role **run**, including an empty role, also receives a fresh UUID in
`AGENTROLES_INVOCATION_ID` and the selected harness name in `AGENTROLES_HARNESS`.
The harness's MCP servers, monitors and other subprocesses inherit these values
unless native configuration overrides them. This correlates one invocation,
not a durable session, account or authorization. Concurrent runs from the same
directory differ; a nested AgentRoles run always gets its own ID and harness,
never the parent's. `show` and `install` do not allocate an invocation ID.

Codex role delivery uses the official CLI's native `-c` overrides and installed
plugin controls; it needs no fork installation. The role's CLI overrides select
an embedded TUI server instead of borrowing a shared daemon that cannot adopt
process-local configuration.

Official Fx is launched directly as `fx`. Its CLI lacks the per-invocation
prompt, MCP and skill controls that the retired fork provided, so AgentRoles
refuses Fx before starting it. No global Fx configuration is rewritten to
emulate a Role.

## Codex skills need one install

Codex CLI has no per-process skill root, so a role's skills reach it as a
plugin. `agentroles install <role>`:

1. renders `~/.cache/agentroles/codex-marketplace/plugins/<name>/` (a
   skills-only `.codex-plugin/plugin.json` plus a copy of `skills/`) and lists
   the role in that marketplace's manifest;
2. runs `codex plugin marketplace add` for that directory once, then
   `codex plugin remove` and `codex plugin add <name>@agentroles`, so Codex
   holds its own copy in its plugin cache;
3. sets `plugins."<name>@agentroles".enabled = false` in Codex's config through
   Codex's own `config/value/write` editor, so the plugin is inert everywhere
   until a launch enables it with `-c`.

That is the one command that changes Codex state, and it uses only Codex's
tooling. Re-run it after editing the role's skills; Codex keeps a copy, not a
link. Roles without `skills/` need no install for Codex. Plugin enablement is a
process-local config key. Each role install persists that plugin disabled;
launching a role enables only that role's plugin for the new process. Switching
from a manager role to a worker role does not carry the manager enablement
forward. Reinstalling a worker does not remove another role's cached plugin;
the other plugin remains installed and inert. Refresh every changed role after
editing its skills.

`agentroles install --check <role>` checks that copy without changing it. It
reads the current and installed `skills/` trees, compares file bytes, and prints
one JSON object:

```json
{"schema_version":1,"role":"researcher","plugin":"researcher@agentroles","installed":true,"fresh":false,"missing":["search/SKILL.md"],"extra":[],"changed":["review/SKILL.md"]}
```

The three file-or-directory path lists are sorted and relative to `skills/`;
file contents are never printed. Exit 0 means installed and fresh, while an
absent or stale copy exits 1. The check does not run Codex, render the
marketplace, or read or write Codex configuration. Roles without skills have
nothing to install or check.

## Devin plugins are sticky

Devin CLI has no per-invocation prompt, skill, MCP or plugin flag, so a role
cannot be delivered to one `devin` process. `agentroles install --devin <role>`
instead installs a Devin plugin for every session on this machine:

1. renders `~/.cache/agentroles/devin/<name>/` with `.devin-plugin/plugin.json`,
   `AGENTS.md` from `SYSTEM_PROMPT.md` or `APPEND_SYSTEM_PROMPT.md`, a copy of
   `skills/`, and `mcp.json` as `.mcp.json`;
2. runs `devin plugins remove --local <name>` (absent is fine) then
   `devin plugins install --local --yes <dir>`.

That write uses only Devin's plugin CLI and requires `devin auth login`. The
plugin stays enabled until `devin plugins remove`. Re-run after editing the
role. `AGENTS.md` is always-on context; it does not replace Devin's base prompt.
There is no `agentroles <role> -- devin`.

## Commands

```
agentroles <role> -- <claude|codex|opencode> [harness arguments...]
agentroles list                  roles under the roles home
agentroles show <role>           files, skills, servers and each harness's arguments
agentroles install <role>        Codex plugin install, as above
agentroles install --check <role> JSON freshness check for the installed Codex plugin
agentroles install --devin <role> sticky Devin plugin install, as above
agentroles --help | --version
```

Exit codes: the harness's own for a run, 64 for usage errors, and 1 for an
absent or stale plugin check or a role/delivery problem. Errors include the
reason and, where one exists, the fix.

## Limits

- `mcp.json` values pass through untouched; `${VAR}` expansion is whatever the
  harness does. Codex needs `bearer_token_env_var` rather than an inline token.
- `APPEND_SYSTEM_PROMPT.md` travels inside Codex's argv, which suits prompts,
  not large documents.
- Claude Code loads the rendered plugin for that session only. Codex keeps its
  installed copy until the next `agentroles install`. Devin keeps a sticky
  user-level plugin until `devin plugins remove`; project `.devin/skills` and
  other installed plugins still load. OpenCode reads the role's `skills/`
  in place and needs no install. OpenCode still also loads global, project and
  `~/.claude`/`~/.agents` skills; there is no exclusive skill-root flag.
  `OPENCODE_CONFIG` is merged before project config, so a project
  `opencode.json` can override the role, including a same-name `command`.
  Claude's launch copy is removed after its child exits; `show` renders a
  separate preview copy without replacing a live launch's files.
- Monitors are Claude-only, experimental and interactive-only. Codex,
  OpenCode and Devin installs ignore them. Claude also excludes monitors on
  Amazon Bedrock, Google Cloud's Agent Platform and Microsoft Foundry. A
  rendered manifest proves delivery, not that the Monitor tool is enabled.
- Harness configuration beyond these five capabilities (models, permissions,
  extra flags) is not part of a role yet.

## Development

`bun run check` runs lint, typecheck and the tests; tests use fake harnesses on
a temporary `PATH` and never touch `~/.codex`, `~/.claude`, `~/.local/share/devin`
or the real roles home. `scripts/install.sh --install` links
`~/.local/bin/agentroles` to this checkout the way the other fleet CLIs are
installed.
