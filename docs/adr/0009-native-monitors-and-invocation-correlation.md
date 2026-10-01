# 0009: Native monitors and invocation correlation

Accepted October 1, 2026. Extends [ADR 0001](0001-roles-are-directories-delivered-by-argv.md),
[ADR 0002](0002-explicit-roles-own-their-resources.md) and
[ADR 0008](0008-opencode-2-only-role-delivery.md); no ownership of harness
sessions, accounts or global configuration is added.

`monitors.json` is Claude's native monitors array, not an AgentRoles overlay.
Validate strict entries, unique names, string fields and native `when` values
before launching any harness. Render the unchanged array inline in
`experimental.monitors`, using a session `--plugin-dir` even for monitor-only
roles. Claude owns shell execution, variable expansion, session-start/reload or
skill-invocation triggers, and stdout notifications. Other harnesses ignore the
file. Claude monitors require interactive mode and an available Monitor tool;
rendering does not promise runtime activation. See the official
[manifest](https://code.claude.com/docs/en/plugins/manifest-reference#monitors)
and [components](https://code.claude.com/docs/en/plugins/components#monitors) contracts.

Every role run allocates a fresh UUID in `AGENTROLES_INVOCATION_ID` and sets
`AGENTROLES_HARNESS`, retaining `AGENTROLES_ROLE` and `AGENTROLES_NAME`. Native
subprocesses inherit the same correlation values; nested role runs replace
them, never reuse the parent ID. They are not durable sessions or authorization
credentials. `show` and `install` allocate none. Claude launch plugins now have
unique cache paths and are removed after the child exits; `show` renders its
own preview path. One concurrent launch can no longer regenerate another's
live plugin during monitor reload.

OpenCode V2 `acp` is a role session entry point, not a utility. Its native
handler starts `Standalone.start()` unconditionally; that service launches
`serve --stdio --port 0` with the process environment and a private ownership
lease. Do not invent or append an ACP `--standalone` flag. The existing unique
`OPENCODE_CONFIG` and append plugin therefore reach its private server and each
ACP session location. `attach`, `--server` and utility restrictions remain.

Evidence: installed `opencode v2.0.16`; upstream tag `v2.0.16`,
`packages/cli/src/commands/handlers/acp.ts`,
`packages/cli/src/services/standalone.ts`, and
`services/www/src/docs/content/cli/acp.mdx`. An isolated HOME/XDG catalog probe
launched through this CLI, sent ACP initialize and session/new only, advertised
the role's `/probe` command and skill, connected a local fixture MCP server,
and reported `agentroles.append` active at the generated plugin path. The
private server plugin and MCP fixture observed identical invocation/harness
values. Closing stdin exited 0 and removed the rendered config. No prompt,
model request, authentication action or user harness-state write was used;
the probe session existed only in disposable storage.
This verifies append-plugin setup and registration, not a generated model
response. Fake-PATH CLI tests own delivery, validation, concurrency and nested
correlation regression coverage.
