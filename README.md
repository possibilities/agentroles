> *Slop Made With Sweat: Made with a lot of love by someone who loves code but read none of it.*

# agentroles

Give Claude Code, Codex, AgentVoice, Fx or OpenCode a role for one invocation. A
role is a directory of skills, MCP servers and prompt files; `agentroles`
delivers it to the harness you name by that harness's native process controls
and runs that harness. Nothing in the role touches global harness state, the
account, the workspace or session history, and two shells can run two roles
side by side.

```sh
agentroles researcher -- claude -p "Summarize the papers in ./inbox"
agentroles researcher -- codex exec "Summarize the papers in ./inbox"
agentroles researcher -- agentvoice --allow-full-access
agentroles researcher -- fx
agentroles researcher -- opencode run "Summarize the papers in ./inbox"
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
| `VOICE_AGENT_SYSTEM_PROMPT.md` / `VOICE_AGENT_APPEND_SYSTEM_PROMPT.md` | AgentVoice only: the voice agent's prompt |
| `VOICE_ORCHESTRATOR_SYSTEM_PROMPT.md` / `VOICE_ORCHESTRATOR_APPEND_SYSTEM_PROMPT.md` | AgentVoice only: stand-ins for the general prompt files of the same kind |
| `VOICE_ORCHESTRATOR_MULTI_AGENT_MODE.md` | AgentVoice only: native multi-agent mode text; enables V2 and replaces its delegation policy |
| `VOICE_ORCHESTRATOR_SESSION_START.md` / `VOICE_ORCHESTRATOR_SESSION_END.md` | AgentVoice only: developer instructions to the working agent when a voice session starts or ends |

A replacement and an append for the same agent cannot both be present; the
role fails to load. A file that exists but cannot be read (a broken link, a
directory, no permission) fails the same way, before any harness starts.
`skills/` may contain only skill directories. `mcp.json` server names follow
the role-name rule; each server has exactly one of `command` or `url`.

## What each harness receives

| Capability | Claude Code | Codex CLI | AgentVoice | Fx | OpenCode |
| --- | --- | --- | --- | --- | --- |
| `SYSTEM_PROMPT.md` | `--system-prompt-file` | `-c model_instructions_file=<path>` | `baseInstructions` on the working thread | `--system-prompt-file` | `agent.build.prompt` in a rendered `OPENCODE_CONFIG` JSON (the default primary agent) |
| `APPEND_SYSTEM_PROMPT.md` | `--append-system-prompt-file` | `-c developer_instructions="<text>"` (Codex's developer message after its base prompt) | `developerInstructions` on the working thread | `--append-system-prompt-file` | `instructions: [<path>]` in that JSON |
| `mcp.json` | `--mcp-config <role>/mcp.json` | one `-c mcp_servers.<name>={...}` per server, `type` dropped and `headers` renamed `http_headers` (`sse` is rejected) | per-thread `mcp_servers` config | `--mcp-config <role>/mcp.json`; replaces `~/.fx/mcp.json` for that process (`mcpServers` is accepted as a profile alias) | `mcp` in that JSON: `command` becomes a `local` argv array, `url` becomes `remote`; `sse` is delivered as `remote` |
| `skills/` | `--plugin-dir` on a plugin rendered under `~/.cache/agentroles/claude/<name>/` on every launch; skills appear as `/<name>:<skill>` | `-c plugins.<name>@agentroles.enabled=true` on a plugin installed once by `agentroles install`; skills appear as `$<name>:<skill>` | `skills/extraRoots/set` on the Codex child AgentVoice owns; skills appear under their own names | `--skills-dir <role>/skills` and `--no-default-skills` when the role has `skills/`; skills appear under their own names | `skills.paths: [<role>/skills]`; global, project and external OpenCode skills still load |
| `VOICE_*` files | ignored | ignored | read natively | ignored | ignored |

AgentVoice receives only `--role <dir>` and reads the directory itself, since
only its own process can register skill roots with the child it owns. See its
README section "Roles" for the voice-side rules.

OpenCode has no argv for prompts, skills or MCP. Delivery is
`OPENCODE_CONFIG` pointing at `~/.cache/agentroles/opencode/<name>/opencode.json`,
regenerated on every launch. OpenCode merges that file with global and project
config, so a project `opencode.json` can still override role keys. User tokens
are unchanged; `--agent plan` still selects `plan`, whose prompt is not replaced.

The harness is found on `PATH`, so the AgentLaunch shims still apply their
account, model, effort, and yolo policy. For direct Claude and Codex launches,
the explicit role is the complete skill/MCP layer: AgentLaunch keeps these
native role arguments and does not add its fixed Claude plugin, Codex skill
enables, or MCP definitions. Omitting a skill or server from the role makes it
unavailable for that invocation. Codex options go after `exec`/`review` or `resume <id>`
and before anything else, mirroring AgentLaunch. Fx flags go before the user's
tokens, like Claude's. The child also receives
`AGENTROLES_ROLE=<dir>` and `AGENTROLES_NAME=<name>` in its environment, and
its exit code is agentroles' exit code. AgentRoles sends a private one-shot
resource marker to the immediate AgentLaunch shim; AgentLaunch consumes it
before starting the native child, so nested harness launches receive their
ordinary fleet defaults. AgentVoice receives no marker because it reads
`--role <dir>` itself. Fx and OpenCode receive no marker because they are not
launched through AgentLaunch.

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
agentroles <role> -- <claude|codex|agentvoice|fx|opencode> [harness arguments...]
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
  Fx's `--mcp-config` path does not expand `${HOME}`; use a rendered role whose
  commands are already absolute. A missing file currently loads as empty rather
  than failing. Workspace `.mcp.json` can still add extra servers after trust.
- `APPEND_SYSTEM_PROMPT.md` travels inside Codex's argv, which suits prompts,
  not large documents.
- Claude Code loads the rendered plugin for that session only. Codex keeps its
  installed copy until the next `agentroles install`. Devin keeps a sticky
  user-level plugin until `devin plugins remove`; project `.devin/skills` and
  other installed plugins still load. Fx and OpenCode read the role's `skills/`
  in place and need no install. OpenCode still also loads global, project and
  `~/.claude`/`~/.agents` skills; there is no exclusive skill-root flag.
  `OPENCODE_CONFIG` is merged before project config, so a project
  `opencode.json` can override the role.
- Harness configuration beyond these four capabilities (models, permissions,
  extra flags) is not part of a role yet.

## Development

`bun run check` runs lint, typecheck and the tests; tests use fake harnesses on
a temporary `PATH` and never touch `~/.codex`, `~/.claude`, `~/.local/share/devin`
or the real roles home. `scripts/install.sh --install` links
`~/.local/bin/agentroles` to this checkout the way the other fleet CLIs are
installed.
