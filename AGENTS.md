# agentroles — repository guidance

Read [ADR 0001](docs/adr/0001-roles-are-directories-delivered-by-argv.md) and
[ADR 0002](docs/adr/0002-explicit-roles-own-their-resources.md) before
changing role delivery or native-control ownership.

One CLI that gives a harness invocation a role: it loads a role directory,
renders that harness's native arguments or env, and execs the harness through
PATH.
The role directory format is the contract; README.md is its canonical
description and GLOSSARY.md its vocabulary. Nothing here owns sessions,
accounts, workspaces or harness configuration beyond the four capabilities.

## Commands

- `bun run check` — lint, typecheck, tests. Tests use fake harnesses on a
  temporary PATH and disposable HOME/CODEX_HOME; never run them against real
  state, and never add a test that needs a real `codex`, `claude` or `devin`.
- `bun run format` — Biome fixes.
- `scripts/install.sh --install|--uninstall` — link the command into
  ~/.local/bin, called by AgentStart's `install-agent-clis`.

## Source map

- `src/main.ts`: command grammar, `deliver()` (harness → argv/env), exit codes.
- `src/role.ts`: role resolution and loading; every validation a harness would
  otherwise discover late (exclusive prompt files, skill layout, mcp.json shape).
- `src/deliver/{claude,codex,fx,opencode}.ts`: pure argv or env
  rendering. Codex overrides follow `exec`/`review` and
  `resume <id>`. Fx flags go before the user's tokens, like Claude. OpenCode
  has no role prompt argv; it requires V2, sets `OPENCODE_CONFIG` to a
  cache-rendered JSON, and uses a private server for nonempty roles. See
  [ADR 0008](docs/adr/0008-opencode-2-only-role-delivery.md).
- `src/mcp.ts`, `src/toml.ts`: `.mcp.json` parsing and the Codex/OpenCode
  translations; TOML rendering that Codex's `-c` parser accepts verbatim.
- `src/render.ts`: cache-rendered Claude plugin, Codex marketplace, OpenCode
  config and append plugin, and Devin plugin; always regenerated, never edited in place.
- `src/codex-plugin.ts`, `src/app-server.ts`: `install` through Codex's own
  plugin CLI and config editor RPC; the only path that writes Codex state.
- `src/devin-plugin.ts`: `install --devin` through Devin's plugin CLI; the only
  path that writes Devin state. The plugin stays enabled for every session.
- `src/exec.ts`: PATH resolution, signal forwarding, exit-code mapping.

## Invariants

- A role file is one native control of the target harness. Do not invent
  agentroles-shaped overlays; if a harness lacks a control, say so in README.
- Launching writes nothing outside `~/.cache/agentroles`. Only `install` changes
  Codex state, only through Codex tooling, and only to install a plugin that
  stays disabled globally. Only `install --devin` changes Devin state, only
  through Devin's plugin CLI, and that plugin stays enabled for every session.
- Never set `skills.config` for Codex. An explicit role selects only its inert
  role plugin. Plugin-level enablement is the per-process role mechanism.
- The harness runs through PATH so fleet shims keep their policy; do not
  bypass them.
- `AGENTROLES_ROLE` and `AGENTROLES_NAME` remain available to role-aware skills.
- Role and MCP server names stay within `[A-Za-z0-9][A-Za-z0-9_-]*`; they are
  unquoted Codex key segments and plugin ids.

## The fleet

This checkout is one of the agent* fleet under `~/code`. `skills/agentroles/`
ships into AgentStart's fixed fleet resources through
`~/code/agentstart/scripts/sync-skills`. Cross-tool calls (claude, codex,
fx, opencode, and `devin plugins install`)
belong in `~/code/agentstart/skills/fleet/MAP.md`; keep it current with any
change here.
