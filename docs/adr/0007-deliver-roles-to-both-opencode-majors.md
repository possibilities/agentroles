# 0007: Deliver roles to both OpenCode majors

Accepted September 24, 2026. Supersedes the V1-only mapping and fixed cache
path in [ADR 0004](0004-opencode-is-delivered-through-opencode-config.md), while
retaining its per-invocation `OPENCODE_CONFIG` boundary.

AgentRoles probes the selected OpenCode executable resolved from the launch PATH with
`--version` and refuses unknown majors. OpenCode 1 keeps the established
`agent.build.prompt`, `instructions`, `skills.paths`, `command`, and direct
`mcp` mapping. OpenCode 2 receives `agents.build.system`, `skills`, `commands`,
and `mcp.servers`. Its accepted legacy `instructions` field is not loaded, so
an append role instead renders a local server plugin whose `context` hook adds
the role text after the built-in prompt on each agent-loop request. The plugin
exports the native plugin object without an npm runtime dependency.

AgentStart's separate `opencode2` command is an alias for the same role
delivery branch, but the version probe follows that exact executable rather
than asking `opencode` or npm which version is installed.

Every nonempty V2 role launches a private `--standalone` server and gets a
unique cache directory containing its config and optional append plugin. The
directory is removed after the child exits. This prevents a shared server or
another role launch from adopting process-local resources. V2 `attach` and
`--server` cannot guarantee that boundary and are refused; utility subcommands
that do not accept `--standalone` are also refused for nonempty roles. Empty
roles continue to pass through without installing a private role layer.

Evidence: `src/deliver/opencode.ts`, `src/render.ts`, `src/main.ts`, and
`test/{deliver,cli}.test.ts`. In isolated homes, OpenCode 1.18.32 and OpenCode
2.0.16 each produced append and replacement prompt markers, activated a role
skill, and invoked a role MCP tool. Both full-screen TUIs showed the role's
`/probe` slash command and one connected MCP server. Two distinct V2 append
roles produced only their own markers. A future global binary cutover still
needs normal installation and live-session timing decisions.
