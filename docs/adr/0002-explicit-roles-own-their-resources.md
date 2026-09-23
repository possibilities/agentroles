# 0002: Explicit roles own their resources

The AgentLaunch marker transport below was retired September 23, 2026.
AgentStart's bare shims now add permission defaults but no role resources;
AgentRoles delivers native role arguments directly through PATH. The inert
Codex plugin and per-invocation role boundaries remain unchanged. The original
transport reasoning is preserved below as history.

Accepted September 14, 2026.

For direct Claude and Codex delivery, an AgentRoles directory is the complete
skill and MCP layer. AgentRoles renders only that role's native arguments and
marks the immediate AgentLaunch shim with
`AGENTLAUNCH_ROLE_RESOURCES=agentroles-v1`. AgentLaunch keeps its account,
model, effort, yolo, native-session, and shim responsibilities while omitting
its fixed Claude plugin, Codex skill enables, and MCP definitions.

The marker travels with the already established absolute `AGENTROLES_ROLE`
and matching `AGENTROLES_NAME`. AgentLaunch validates all three and refuses a
bad source instead of restoring global resources. It removes the marker before
starting the native harness, preserving the role name and path without making
the resource decision sticky in nested shells. AgentVoice receives no marker;
its `--role` contract remains native.

Each Codex role plugin remains installed but disabled in persistent config.
One launch enables only its selected role plugin for that process; switching
roles therefore does not carry a previous role's skills forward. Reinstalling
a changed role refreshes its copied skills without deleting another inert role.

This narrows ADR 0001's earlier additive AgentLaunch resource assumption. A
role can intentionally omit a skill or MCP server, and that omission remains
effective for the invocation.

Evidence: `src/exec.ts`, `test/cli.test.ts`, and AgentLaunch ADR 0035.
