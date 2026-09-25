# agentroles vocabulary

**Role** — A directory that names what an agent can do for one invocation:
skills, MCP servers, and a system prompt replacement or append. Resolved by
name under the roles home or by
path. Not an identity, account, workspace, or session. _Avoid_: capability,
overlay, profile, preset.

**Harness** — A program that runs an agent and that a role is delivered to:
Claude Code (`claude`), the Codex CLI (`codex`), Fx (`fx`), or OpenCode
(`opencode` or the side-by-side `opencode2`).
_Avoid_: backend, provider.

**Delivery** — The harness-specific rendering of a role into native process
controls (argv, and for OpenCode `OPENCODE_CONFIG`), followed by running the
harness through PATH. For direct Claude/Codex delivery, the role supplies its
native skill and MCP arguments. Fx receives the
same native prompt and MCP flags as Claude, plus `--skills-dir` when present
and `--no-default-skills` for any nonempty role. OpenCode receives a
cache-rendered `opencode.json` via `OPENCODE_CONFIG`; its exact fields follow
the detected major. V2 uses a private server and a native plugin hook for
append prompts. _Avoid_: injection, mangling.

**Roles home** — `$AGENTROLES_HOME`, default `~/.config/agentroles`, where
named roles live. _Avoid_: registry, catalog.

**Install** — The command that writes harness plugin state. Bare
`agentroles install` writes Codex state: a skills-only plugin in the
`agentroles` marketplace, installed through Codex's plugin CLI and persisted
disabled; launches enable it per process. `agentroles install --devin` writes
Devin state: a rendered plugin installed with `devin plugins install --local`,
enabled for every session on this machine. _Avoid_: activate, register.

**Freshness check** — `agentroles install --check <role>`: a read-only,
machine-readable comparison of the role's current skill tree with Codex's
installed plugin copy. _Avoid_: sync, refresh (those imply mutation).
