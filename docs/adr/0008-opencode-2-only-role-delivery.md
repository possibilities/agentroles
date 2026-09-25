# 0008: Deliver roles only to OpenCode 2

Accepted September 24, 2026. Supersedes [ADR 0007](0007-deliver-roles-to-both-opencode-majors.md)
after AgentStart's default-command cutover.

`opencode` must report major version 2 before AgentRoles launches any role.
The `opencode2` command and V1 configuration mapping are retired. For nonempty
roles, a unique per-launch config and append plugin run under a private
`--standalone` server; empty roles pass through without a private server.
This retains the V2 isolation demonstrated in ADR 0007, while removing the
dual-major surface and making a V1 executable on PATH fail explicitly.
