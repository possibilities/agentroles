# 0010: Retire fork-only Fx Role delivery

Accepted October 20, 2026. Supersedes Fx delivery in
[ADR 0001](0001-roles-are-directories-delivered-by-argv.md) and
[ADR 0006](0006-fork-aware-direct-role-delivery.md).

AgentStart installs official Fx. Its native CLI does not support the five
per-invocation flags used by AgentRoles: `--system-prompt-file`,
`--append-system-prompt-file`, `--mcp-config`, `--skills-dir` and
`--no-default-skills`. A disposable-profile check of official Fx 0.0.14
returned an unknown-subcommand error for every flag.

AgentRoles removes Fx from its delivery catalog and refuses an explicit Fx
target before spawning a process, with guidance to run `fx` directly or use
one of the supported Role harnesses. Keeping the old adapter would either
fail downstream or imply isolation that the native CLI cannot supply.
Rewriting global or workspace Fx settings would violate per-invocation Role
ownership, and retaining a fork solely for these flags would preserve the
maintenance dependency the operator explicitly retired.

Bare Fx remains native. The other harnesses, Role directory format, native
accounts, histories and configuration are unchanged. Tests assert that a
retired Fx target cannot launch even if a runnable executable is on PATH.
