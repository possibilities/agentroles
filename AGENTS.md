# agentroles — repository guidance

Read [ADR 0001](docs/adr/0001-roles-are-directories-delivered-by-argv.md)
before changing role delivery or native-control ownership.

One CLI that gives a harness invocation a role: it loads a role directory,
renders that harness's native arguments, and execs the harness through PATH.
The role directory format is the contract; README.md is its canonical
description and CONTEXT.md its vocabulary. Nothing here owns sessions,
accounts, workspaces or harness configuration beyond the four capabilities.

## Commands

- `bun run check` — lint, typecheck, tests. Tests use fake harnesses on a
  temporary PATH and disposable HOME/CODEX_HOME; never run them against real
  state, and never add a test that needs a real `codex` or `claude`.
- `bun run format` — Biome fixes.
- `scripts/install.sh --install|--uninstall` — link the command into
  ~/.local/bin, called by AgentStart's `install-agent-clis`.

## Source map

- `src/main.ts`: command grammar, `deliver()` (harness → argv), exit codes.
- `src/role.ts`: role resolution and loading; every validation a harness would
  otherwise discover late (exclusive prompt files, skill layout, mcp.json shape).
- `src/deliver/{claude,codex,agentvoice}.ts`: pure argv rendering. Codex
  placement mirrors AgentLaunch (after `exec`/`review`, after `resume <id>`).
- `src/mcp.ts`, `src/toml.ts`: `.mcp.json` parsing and the Codex translation;
  TOML rendering that Codex's `-c` parser accepts verbatim.
- `src/render.ts`: cache-rendered Claude plugin and Codex marketplace; always
  regenerated, never edited in place.
- `src/codex-plugin.ts`, `src/app-server.ts`: `install` through Codex's own
  plugin CLI and config editor RPC; the only path that writes Codex state.
- `src/exec.ts`: PATH resolution, signal forwarding, exit-code mapping.

## Invariants

- A role file is one native control of the target harness. Do not invent
  agentroles-shaped overlays; if a harness lacks a control, say so in README.
- Launching writes nothing outside `~/.cache/agentroles`. Only `install` changes
  Codex state, only through Codex tooling, and only to install a plugin that
  stays disabled globally.
- Never set `skills.config` for Codex: the AgentLaunch shim prepends its own
  and a later `-c` for the same key would replace the fleet's. Plugin-level
  enablement is the per-process mechanism.
- The harness runs through PATH so fleet shims keep their policy; do not
  bypass them.
- Role and MCP server names stay within `[A-Za-z0-9][A-Za-z0-9_-]*`; they are
  unquoted Codex key segments and plugin ids.

## The fleet

This checkout is one of the agent* fleet under `~/code`. `skills/agentroles/`
ships into AgentStart's fixed fleet resources through
`~/code/agentstart/scripts/sync-skills`. Cross-tool calls (claude, codex,
agentvoice, and AgentVoice's `--role`) belong in
`~/code/agentstart/skills/fleet/MAP.md`; keep it current with any change here.
