# agentroles vocabulary

**Role** — A directory that names what an agent can do for one invocation:
skills, MCP servers, a system prompt replacement or append, and Claude plugin
monitors. Resolved by name under the roles home or by path. Not an identity,
account, workspace, or session. _Avoid_: capability,
overlay, profile, preset.

**Harness** — A program that runs an agent and that a role is delivered to:
Claude Code (`claude`), the Codex CLI (`codex`), or OpenCode 2
(`opencode`).
_Avoid_: backend, provider.

**Delivery** — The harness-specific rendering of a role into native process
controls (argv, and for OpenCode `OPENCODE_CONFIG`), followed by running the
harness through PATH. For direct Claude/Codex delivery, the role supplies its
native skill and MCP arguments. OpenCode receives a
cache-rendered `opencode.json` via `OPENCODE_CONFIG`. OpenCode 2 uses a
private server and a native plugin hook for
append prompts. _Avoid_: injection, mangling.

**Monitor** — A native Claude plugin entry in the role's `monitors.json` array.
Claude owns the persistent shell process, trigger and stdout notifications;
AgentRoles only validates and renders it in the session plugin manifest.
Other harnesses ignore it. _Avoid_: watcher service, callback, overlay.

**Invocation** — One role run, correlated by a fresh `AGENTROLES_INVOCATION_ID`
UUID and `AGENTROLES_HARNESS` in the harness's child environment. Descendant
processes inherit them; a nested role run replaces them. Not a durable session,
account, or authorization. `show` and `install` allocate none. _Avoid_: session
ID, owner credential, identity.

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
