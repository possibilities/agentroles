#!/usr/bin/env bun
/**
 * agentroles: give one harness invocation a role. The role directory is the
 * contract (README); this file only routes commands and renders arguments.
 */
import { homedir } from "node:os";
import { basename } from "node:path";
import { checkCodexPlugin, codexPluginInstalled, installCodexPlugin } from "./codex-plugin.ts";
import { agentvoiceArguments } from "./deliver/agentvoice.ts";
import { claudeArguments } from "./deliver/claude.ts";
import { codexArguments, codexOverrides, codexPluginId } from "./deliver/codex.ts";
import { fxArguments } from "./deliver/fx.ts";
import { opencodeArguments, opencodeConfig, opencodeEnv } from "./deliver/opencode.ts";
import { RoleError, UsageError } from "./errors.ts";
import { runHarness } from "./exec.ts";
import { cacheHome, type Environ, rolesHome } from "./paths.ts";
import { renderClaudePlugin, renderOpencodeConfig } from "./render.ts";
import { listRoles, loadRole, type Role, resolveRolePath } from "./role.ts";

export const VERSION = "0.1.0";
export const HARNESSES = ["claude", "codex", "agentvoice", "fx", "opencode"] as const;
export type Harness = (typeof HARNESSES)[number];

export const HELP = `agentroles ${VERSION}

Give Claude Code, Codex, AgentVoice, Fx or OpenCode a role for one invocation:
the role directory's skills, MCP servers and prompt files apply to that process
only.

Usage:
  agentroles <role> -- <claude|codex|agentvoice|fx|opencode> [harness arguments...]
  agentroles list
  agentroles show <role>
  agentroles install <role>        install the role's skills as a disabled Codex plugin
  agentroles install --check <role> compare the role's skills with Codex's installed copy (JSON)
  agentroles --help | --version

<role> is a name under $AGENTROLES_HOME (default ~/.config/agentroles) or a
directory path. A role directory holds any of:
  SYSTEM_PROMPT.md | APPEND_SYSTEM_PROMPT.md     the agent's prompt (one or the other)
  skills/<name>/SKILL.md                          skills
  mcp.json                                        MCP servers, .mcp.json shape
  VOICE_*.md                                      AgentVoice's voice prompts

The harness runs through PATH, so fleet shims still apply. Its exit code is
returned unchanged. For install --check, 0 means fresh and 1 means absent or stale.
`;

export interface Command {
  kind: "run" | "list" | "show" | "install" | "install-check" | "help" | "version";
  role?: string;
  command?: string[];
}

export function parseCommand(argv: string[]): Command {
  const [first, ...rest] = argv;
  if (first === undefined || first === "--help" || first === "-h") return { kind: "help" };
  if (first === "--version" || first === "-V") return { kind: "version" };
  if (first === "list") {
    if (rest.length > 0) throw new UsageError("list takes no arguments");
    return { kind: "list" };
  }
  if (first === "install" && rest[0] === "--check") {
    const [role, ...extra] = rest.slice(1);
    if (role === undefined || extra.length > 0)
      throw new UsageError("install --check takes exactly one role");
    return { kind: "install-check", role };
  }
  if (first === "show" || first === "install") {
    const [role, ...extra] = rest;
    if (role === undefined || extra.length > 0)
      throw new UsageError(`${first} takes exactly one role`);
    return { kind: first, role };
  }
  if (first.startsWith("-")) throw new UsageError(`unknown option "${first}"`);
  const separator = rest.indexOf("--");
  if (separator !== 0)
    throw new UsageError(
      `expected "agentroles ${first} -- <claude|codex|agentvoice|fx|opencode> [arguments...]"`,
    );
  const command = rest.slice(1);
  if (command.length === 0) throw new UsageError("no harness command given after --");
  return { kind: "run", role: first, command };
}

export function harnessOf(command: string[]): Harness {
  const name = basename(command[0] ?? "");
  if ((HARNESSES as readonly string[]).includes(name)) return name as Harness;
  throw new RoleError(
    `"${name}" is not a supported harness`,
    `use one of ${HARNESSES.join(", ")} after --`,
  );
}

export interface Delivery {
  harness: Harness;
  command: string[];
  env?: Environ;
}

/** Renders the full command; Claude and OpenCode write cache files before launch. */
export function deliver(role: Role, command: string[], env: Environ, home: string): Delivery {
  const harness = harnessOf(command);
  const [bin, ...native] = command as [string, ...string[]];
  switch (harness) {
    case "claude": {
      const pluginDir =
        role.skillNames.length > 0 ? renderClaudePlugin(role, cacheHome(env, home)) : null;
      return { harness, command: [bin, ...claudeArguments(role, pluginDir, native)] };
    }
    case "codex": {
      const overrides = codexOverrides(role, codexPluginInstalled(role, env, home));
      return { harness, command: [bin, ...codexArguments(overrides, native)] };
    }
    case "agentvoice":
      return { harness, command: [bin, ...agentvoiceArguments(role, native)] };
    case "fx":
      return { harness, command: [bin, ...fxArguments(role, native)] };
    case "opencode": {
      const config = opencodeConfig(role);
      const configPath =
        config === null ? null : renderOpencodeConfig(role, cacheHome(env, home), config);
      return {
        harness,
        command: [bin, ...opencodeArguments(native)],
        env: opencodeEnv(configPath),
      };
    }
  }
}

function load(spec: string, env: Environ, home: string): Role {
  return loadRole(resolveRolePath(spec, env, home, process.cwd()));
}

function describe(role: Role, env: Environ, home: string): string {
  const lines = [`role ${role.name}`, `  dir: ${role.dir}`];
  if (role.systemPrompt) lines.push(`  system prompt: ${basename(role.systemPrompt)} (replaces)`);
  if (role.appendSystemPrompt)
    lines.push(`  system prompt: ${basename(role.appendSystemPrompt)} (appends)`);
  for (const path of Object.values(role.voice)) lines.push(`  voice: ${basename(path)}`);
  lines.push(`  skills: ${role.skillNames.length > 0 ? role.skillNames.join(", ") : "none"}`);
  lines.push(
    `  mcp servers: ${role.mcpServers ? Object.keys(role.mcpServers).join(", ") : "none"}`,
  );
  if (role.skillNames.length > 0)
    lines.push(
      `  codex plugin ${codexPluginId(role)}: ${
        codexPluginInstalled(role, env, home) ? "installed" : "not installed (agentroles install)"
      }`,
    );
  for (const harness of HARNESSES) {
    try {
      const delivery = deliver(role, [harness], env, home);
      lines.push(`  ${harness}: ${describeDelivery(delivery)}`);
    } catch (error) {
      lines.push(`  ${harness}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return lines.join("\n");
}

function describeDelivery(delivery: Delivery): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(delivery.env ?? {})) {
    if (value !== undefined) parts.push(`${key}=${shellWord(value)}`);
  }
  parts.push(...delivery.command.slice(1).map(shellWord));
  return parts.join(" ") || "(no arguments)";
}

function shellWord(token: string): string {
  return /^[A-Za-z0-9_./=:@+-]+$/.test(token) ? token : `'${token.replaceAll("'", "'\\''")}'`;
}

export async function main(argv: string[], env: Environ = process.env): Promise<number> {
  const home = env["HOME"] ?? homedir();
  let command: Command;
  try {
    command = parseCommand(argv);
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(`agentroles: ${error.message}\n\n${HELP}`);
      return 64;
    }
    throw error;
  }
  try {
    switch (command.kind) {
      case "help":
        console.log(HELP);
        return 0;
      case "version":
        console.log(VERSION);
        return 0;
      case "list": {
        const home_ = rolesHome(env, home);
        const roles = listRoles(home_);
        if (roles.length === 0) console.log(`no roles under ${home_}`);
        else for (const role of roles) console.log(role);
        return 0;
      }
      case "show":
        console.log(describe(load(command.role!, env, home), env, home));
        return 0;
      case "install":
        await installCodexPlugin(load(command.role!, env, home), env, home, (line) =>
          console.error(`agentroles: ${line}`),
        );
        return 0;
      case "install-check": {
        const result = checkCodexPlugin(load(command.role!, env, home), env, home);
        console.log(JSON.stringify(result));
        return result.fresh ? 0 : 1;
      }
      case "run": {
        const role = load(command.role!, env, home);
        const delivery = deliver(role, command.command!, env, home);
        return await runHarness(role, delivery.command, env, delivery.env ?? {});
      }
    }
  } catch (error) {
    if (error instanceof RoleError) {
      console.error(`agentroles: ${error.message}${error.hint ? `\n  ${error.hint}` : ""}`);
      return 1;
    }
    throw error;
  }
}

if (import.meta.main) process.exit(await main(process.argv.slice(2)));
