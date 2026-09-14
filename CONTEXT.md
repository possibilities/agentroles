# agentroles vocabulary

**Role** — A directory that names what an agent can do for one invocation:
skills, MCP servers, and a system prompt replacement or append, plus
AgentVoice's voice prompt files. Resolved by name under the roles home or by
path. Not an identity, account, workspace, or session. _Avoid_: capability,
overlay, profile, preset.

**Harness** — A program that runs an agent and that a role is delivered to:
Claude Code (`claude`), the Codex CLI (`codex`), or AgentVoice (`agentvoice`).
_Avoid_: backend, provider.

**Delivery** — The harness-specific rendering of a role into command-line
arguments (and, for Claude, a rendered plugin directory), followed by running
the harness through PATH. For direct Claude/Codex delivery, the role is the
complete skill/MCP layer; omissions remain absent when the AgentLaunch shim
applies its separate account, model, effort, and yolo policy. _Avoid_: injection,
mangling.

**Roles home** — `$AGENTROLES_HOME`, default `~/.config/agentroles`, where
named roles live. _Avoid_: registry, catalog.

**Install** — The one command that writes Codex state: rendering a role's
skills as a plugin in the `agentroles` marketplace, installing it with
Codex's plugin CLI, and persisting it disabled through Codex's config editor.
Launches then enable it per process. _Avoid_: activate, register.

**Freshness check** — `agentroles install --check <role>`: a read-only,
machine-readable comparison of the role's current skill tree with Codex's
installed plugin copy. _Avoid_: sync, refresh (those imply mutation).
