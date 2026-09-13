> *Slop Made With Sweat: Made with a lot of love by someone who loves code but read none of it.*

# agentroles

Give Claude Code, Codex or AgentVoice a role for one invocation. A role is a
directory of skills, MCP servers and prompt files; `agentroles` delivers it to
the harness you name by command-line arguments and runs that harness. Nothing
in the role touches global harness state, the account, the workspace or
session history, and two shells can run two roles side by side.

```sh
agentroles researcher -- claude -p "Summarize the papers in ./inbox"
agentroles researcher -- codex exec "Summarize the papers in ./inbox"
agentroles researcher -- agentvoice --allow-full-access
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

| Capability | Claude Code | Codex CLI | AgentVoice |
| --- | --- | --- | --- |
| `SYSTEM_PROMPT.md` | `--system-prompt-file` | `-c model_instructions_file=<path>` | `baseInstructions` on the working thread |
| `APPEND_SYSTEM_PROMPT.md` | `--append-system-prompt-file` | `-c developer_instructions="<text>"` (Codex's developer message after its base prompt) | `developerInstructions` on the working thread |
| `mcp.json` | `--mcp-config <role>/mcp.json` | one `-c mcp_servers.<name>={...}` per server, `type` dropped and `headers` renamed `http_headers` (`sse` is rejected) | per-thread `mcp_servers` config |
| `skills/` | `--plugin-dir` on a plugin rendered under `~/.cache/agentroles/claude/<name>/` on every launch; skills appear as `/<name>:<skill>` | `-c plugins.<name>@agentroles.enabled=true` on a plugin installed once by `agentroles install`; skills appear as `$<name>:<skill>` | `skills/extraRoots/set` on the Codex child AgentVoice owns; skills appear under their own names |
| `VOICE_*` files | ignored | ignored | read natively |

AgentVoice receives only `--role <dir>` and reads the directory itself, since
only its own process can register skill roots with the child it owns. See its
README section "Roles" for the voice-side rules.

The harness is found on `PATH`, so the AgentLaunch shims still apply their
fleet policy first. Codex options go after `exec`/`review` or `resume <id>`
and before anything else, mirroring AgentLaunch. The child also receives
`AGENTROLES_ROLE=<dir>` and `AGENTROLES_NAME=<name>` in its environment, and
its exit code is agentroles' exit code.

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
different config key from the fleet's `skills.config`, so it never replaces
AgentLaunch's own skill policy.

## Commands

```
agentroles <role> -- <claude|codex|agentvoice> [harness arguments...]
agentroles list                  roles under the roles home
agentroles show <role>           files, skills, servers and each harness's arguments
agentroles install <role>        Codex plugin install, as above
agentroles --help | --version
```

Exit codes: the harness's own for a run, 64 for usage errors, 1 for a role or
delivery problem, each with the reason and, where one exists, the fix.

## Limits

- `mcp.json` values pass through untouched; `${VAR}` expansion is whatever the
  harness does. Codex needs `bearer_token_env_var` rather than an inline token.
- `APPEND_SYSTEM_PROMPT.md` travels inside Codex's argv, which suits prompts,
  not large documents.
- Claude Code loads the rendered plugin for that session only. Codex keeps its
  installed copy until the next `agentroles install`.
- Harness configuration beyond these four capabilities (models, permissions,
  extra flags) is not part of a role yet.

## Development

`bun run check` runs lint, typecheck and the tests; tests use fake harnesses on
a temporary `PATH` and never touch `~/.codex`, `~/.claude` or the real roles
home. `scripts/install.sh --install` links `~/.local/bin/agentroles` to this
checkout the way the other fleet CLIs are installed.
