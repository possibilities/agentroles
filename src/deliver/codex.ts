import { readFileSync } from "node:fs";
import { RoleError } from "../errors.ts";
import { toCodexMcpServers } from "../mcp.ts";
import { CODEX_MARKETPLACE } from "../render.ts";
import type { Role } from "../role.ts";
import { tomlString, tomlValue } from "../toml.ts";

/** Codex plugin id for a role; the key segment must stay unquoted, hence no dots in names. */
export function codexPluginId(role: Role): string {
  return `${role.name}@${CODEX_MARKETPLACE}`;
}

/**
 * A role selects its own globally inert plugin for this invocation.
 */
export function codexOverrides(role: Role, pluginInstalled: boolean): string[] {
  const overrides: string[] = [];
  if (role.systemPrompt !== undefined)
    overrides.push(`model_instructions_file=${tomlString(role.systemPrompt)}`);
  if (role.appendSystemPrompt !== undefined)
    overrides.push(
      `developer_instructions=${tomlString(readFileSync(role.appendSystemPrompt, "utf8"))}`,
    );
  if (role.mcpServers !== undefined && role.mcpPath !== undefined) {
    for (const [name, server] of Object.entries(toCodexMcpServers(role.mcpServers, role.mcpPath)))
      overrides.push(`mcp_servers.${name}=${tomlValue(server)}`);
  }
  if (role.skillNames.length > 0) {
    if (!pluginInstalled)
      throw new RoleError(
        `role ${role.name} has skills but its Codex plugin ${codexPluginId(role)} is not installed`,
        `run: agentroles install ${role.name}`,
      );
    overrides.push(`plugins.${codexPluginId(role)}.enabled=true`);
  }
  return overrides.flatMap((entry) => ["-c", entry]);
}

const NON_INTERACTIVE = new Set(["exec", "e", "review"]);
const GLOBAL_VALUE_FLAGS = new Set([
  "-c",
  "--config",
  "--enable",
  "--disable",
  "--remote",
  "--remote-auth-token-env",
  "-i",
  "--image",
  "-m",
  "--model",
  "--local-provider",
  "-p",
  "--profile",
  "-s",
  "--sandbox",
  "-C",
  "--cd",
  "--add-dir",
  "-a",
  "--ask-for-approval",
]);
const ATTACHED_VALUE_FLAGS = ["-c", "-i", "-m", "-p", "-s", "-C", "-a"];

/** Index of `exec`/`review` after leading global options, else null. */
export function codexCommandIndex(tokens: readonly string[]): number | null {
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    if (token === "--") return null;
    if (GLOBAL_VALUE_FLAGS.has(token)) {
      index += 1;
      continue;
    }
    if (token.startsWith("--") || token === "-V" || token === "-h") continue;
    if (ATTACHED_VALUE_FLAGS.some((flag) => token.startsWith(flag) && token.length > flag.length))
      continue;
    return NON_INTERACTIVE.has(token) ? index : null;
  }
  return null;
}

/** Overrides follow a non-interactive subcommand (and a `resume <id>`), else lead. */
export function codexArguments(overrides: string[], native: string[]): string[] {
  const commandIndex = codexCommandIndex(native);
  if (commandIndex !== null)
    return [...native.slice(0, commandIndex + 1), ...overrides, ...native.slice(commandIndex + 1)];
  if (native[0] === "resume" && native[1] !== undefined && !native[1].startsWith("-"))
    return [native[0], native[1], ...overrides, ...native.slice(2)];
  return [...overrides, ...native];
}
