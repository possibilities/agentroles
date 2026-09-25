#!/usr/bin/env bun
/**
 * agentroles: give one harness invocation a role. The role directory is the
 * contract (README); this file only routes commands and renders arguments.
 */
import { rmSync } from "node:fs";
import { homedir } from "node:os";
import { basename } from "node:path";
import { checkCodexPlugin, codexPluginInstalled, installCodexPlugin } from "./codex-plugin.ts";
import { claudeArguments } from "./deliver/claude.ts";
import { codexArguments, codexOverrides, codexPluginId } from "./deliver/codex.ts";
import { fxArguments } from "./deliver/fx.ts";
import {
  type OpencodeMajor,
  opencodeArguments,
  opencodeConfig,
  opencodeEnv,
  opencodeVersion,
} from "./deliver/opencode.ts";
import { devinPluginRendered, installDevinPlugin } from "./devin-plugin.ts";
import { RoleError, UsageError } from "./errors.ts";
import { runHarness } from "./exec.ts";
import { cacheHome, type Environ, rolesHome } from "./paths.ts";
import {
  devinPluginDir,
  renderClaudePlugin,
  renderOpencodeConfig,
  renderOpencodeV2,
} from "./render.ts";
import { listRoles, loadRole, type Role, resolveRolePath } from "./role.ts";

export const VERSION = "0.1.0";
export const HARNESSES = ["claude", "codex", "fx", "opencode"] as const;
export type Harness = (typeof HARNESSES)[number];

export const HELP = `agentroles ${VERSION}

Give Claude Code, Codex, Fx or OpenCode a role for one invocation:
the role directory's skills, MCP servers and prompt files apply to that process
only.

Usage:
  agentroles <role> -- <claude|codex|fx|opencode> [harness arguments...]
  agentroles list
  agentroles show <role>
  agentroles install <role>        install the role's skills as a disabled Codex plugin
  agentroles install --check <role> compare the role's skills with Codex's installed copy (JSON)
  agentroles install --devin <role> install the role as a sticky Devin plugin for every session
  agentroles --help | --version

<role> is a name under $AGENTROLES_HOME (default ~/.config/agentroles) or a
directory path. A role directory holds any of:
  SYSTEM_PROMPT.md | APPEND_SYSTEM_PROMPT.md     the agent's prompt (one or the other)
  skills/<name>/SKILL.md                          skills
  mcp.json                                        MCP servers, .mcp.json shape

The harness runs through PATH, so fleet shims still apply. Its exit code is
returned unchanged. For install --check, 0 means fresh and 1 means absent or stale.
`;

export interface Command {
  kind:
    | "run"
    | "list"
    | "show"
    | "install"
    | "install-check"
    | "install-devin"
    | "help"
    | "version";
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
  if (first === "install" && rest[0] === "--devin") {
    const [role, ...extra] = rest.slice(1);
    if (role === undefined || extra.length > 0)
      throw new UsageError("install --devin takes exactly one role");
    return { kind: "install-devin", role };
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
      `expected "agentroles ${first} -- <claude|codex|fx|opencode> [arguments...]"`,
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
  cleanup?: string;
}

/** Renders the full command; Claude and OpenCode write cache files before launch. */
export function deliver(
  role: Role,
  command: string[],
  env: Environ,
  home: string,
  opencodeMajor: OpencodeMajor = 1,
): Delivery {
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
    case "fx":
      return { harness, command: [bin, ...fxArguments(role, native)] };
    case "opencode": {
      const hasRole =
        role.systemPrompt !== undefined ||
        role.appendSystemPrompt !== undefined ||
        role.skillsRoot !== undefined ||
        role.mcpServers !== undefined;
      const args = opencodeArguments(native, opencodeMajor, hasRole);
      const config = opencodeMajor === 1 ? opencodeConfig(role) : null;
      const rendered =
        opencodeMajor === 2 && hasRole ? renderOpencodeV2(role, cacheHome(env, home)) : null;
      const configPath =
        opencodeMajor === 1
          ? config === null
            ? null
            : renderOpencodeConfig(role, cacheHome(env, home), config)
          : (rendered?.path ?? null);
      return {
        harness,
        command: [bin, ...args],
        env: opencodeEnv(configPath),
        ...(rendered === null ? {} : { cleanup: rendered.directory }),
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
  lines.push(
    `  devin plugin: ${
      devinPluginRendered(role, env, home)
        ? `${devinPluginDir(role, cacheHome(env, home))} (sticky)`
        : "not installed (agentroles install --devin)"
    }`,
  );
  for (const harness of HARNESSES) {
    try {
      const delivery = deliver(role, [harness], env, home);
      lines.push(`  ${harness}: ${describeDelivery(delivery)}`);
      if (harness === "opencode")
        lines.push("  opencode V2: private server; per-launch native config and append plugin");
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
      case "install-devin":
        installDevinPlugin(load(command.role!, env, home), env, home, (line) =>
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
        const major = harnessOf(command.command!) === "opencode" ? opencodeVersion(env) : 1;
        const delivery = deliver(role, command.command!, env, home, major);
        try {
          return await runHarness(role, delivery.command, env, delivery.env ?? {});
        } finally {
          if (delivery.cleanup) rmSync(delivery.cleanup, { recursive: true, force: true });
        }
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
