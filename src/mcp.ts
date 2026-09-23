/**
 * mcp.json uses Claude Code's `.mcp.json` shape (`{"mcpServers": {...}}`), so
 * Claude loads the file as is. Codex's transport enum rejects unknown keys, so
 * the Claude-only ones are translated for it and everything else passes
 * through for native validation.
 */
import { RoleError } from "./errors.ts";

export const MCP_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
export type McpServers = Record<string, Record<string, unknown>>;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseMcpServers(text: string, source: string): McpServers {
  let document: unknown;
  try {
    document = JSON.parse(text);
  } catch (error) {
    throw new RoleError(`${source}: not valid JSON: ${String(error)}`);
  }
  if (!record(document) || !record(document["mcpServers"]))
    throw new RoleError(`${source}: expected {"mcpServers": {...}}`);
  const servers: McpServers = {};
  for (const [name, entry] of Object.entries(document["mcpServers"])) {
    if (!MCP_NAME_PATTERN.test(name))
      throw new RoleError(`${source}: MCP server name "${name}" must match ${MCP_NAME_PATTERN}`);
    if (!record(entry)) throw new RoleError(`${source}: mcpServers.${name} must be an object`);
    const hasCommand = typeof entry["command"] === "string";
    const hasUrl = typeof entry["url"] === "string";
    if (hasCommand === hasUrl)
      throw new RoleError(`${source}: mcpServers.${name} needs exactly one of command or url`);
    servers[name] = entry;
  }
  return servers;
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function stringRecord(value: unknown): value is Record<string, string> {
  return record(value) && Object.values(value).every((entry) => typeof entry === "string");
}

/**
 * OpenCode-shaped entries: `type` is required (`local` or `remote`), `command`
 * is an argv array, Claude `env` becomes `environment`. SSE URLs travel as
 * `remote` (OpenCode has no separate SSE transport).
 */
export function toOpencodeMcpServers(servers: McpServers, source: string): McpServers {
  const out: McpServers = {};
  for (const [name, entry] of Object.entries(servers)) {
    const type = entry["type"];
    const hasCommand = typeof entry["command"] === "string";
    const hasUrl = typeof entry["url"] === "string";
    const local = type === "local" || type === "stdio" || (type === undefined && hasCommand);
    const remote =
      type === "remote" || type === "http" || type === "sse" || (type === undefined && hasUrl);
    if (local === remote)
      throw new RoleError(
        `${source}: mcpServers.${name}.type "${String(type)}" is not supported by OpenCode (stdio/local or http/sse/remote)`,
      );
    if (local) {
      const command = entry["command"];
      if (typeof command !== "string")
        throw new RoleError(`${source}: mcpServers.${name} needs a string command`);
      const args = entry["args"];
      if (args !== undefined && !stringArray(args))
        throw new RoleError(`${source}: mcpServers.${name}.args must be an array of strings`);
      const environment = entry["env"];
      if (environment !== undefined && !stringRecord(environment))
        throw new RoleError(`${source}: mcpServers.${name}.env must be an object of strings`);
      const cwd = entry["cwd"];
      if (cwd !== undefined && typeof cwd !== "string")
        throw new RoleError(`${source}: mcpServers.${name}.cwd must be a string`);
      const server: Record<string, unknown> = {
        type: "local",
        command: [command, ...(args ?? [])],
      };
      if (environment !== undefined) server["environment"] = environment;
      if (cwd !== undefined) server["cwd"] = cwd;
      assignEnablement(server, entry, `${source}: mcpServers.${name}`);
      assignTimeout(server, entry, `${source}: mcpServers.${name}`);
      out[name] = server;
      continue;
    }
    const headers = entry["headers"];
    if (headers !== undefined && !stringRecord(headers))
      throw new RoleError(`${source}: mcpServers.${name}.headers must be an object of strings`);
    const server: Record<string, unknown> = { type: "remote", url: entry["url"] };
    if (headers !== undefined) server["headers"] = headers;
    assignEnablement(server, entry, `${source}: mcpServers.${name}`);
    assignTimeout(server, entry, `${source}: mcpServers.${name}`);
    out[name] = server;
  }
  return out;
}

function assignEnablement(
  server: Record<string, unknown>,
  entry: Record<string, unknown>,
  source: string,
): void {
  if (entry["enabled"] !== undefined) {
    if (typeof entry["enabled"] !== "boolean")
      throw new RoleError(`${source}.enabled must be a boolean`);
    server["enabled"] = entry["enabled"];
    return;
  }
  if (entry["disabled"] !== undefined) {
    if (typeof entry["disabled"] !== "boolean")
      throw new RoleError(`${source}.disabled must be a boolean`);
    server["enabled"] = !entry["disabled"];
  }
}

function assignTimeout(
  server: Record<string, unknown>,
  entry: Record<string, unknown>,
  source: string,
): void {
  if (entry["timeout"] === undefined) return;
  if (
    typeof entry["timeout"] !== "number" ||
    !Number.isInteger(entry["timeout"]) ||
    entry["timeout"] < 1
  )
    throw new RoleError(`${source}.timeout must be a positive integer`);
  server["timeout"] = entry["timeout"];
}

/** Codex-shaped entries: `type` dropped (sse rejected), `headers` becomes `http_headers`. */
export function toCodexMcpServers(servers: McpServers, source: string): McpServers {
  const out: McpServers = {};
  for (const [name, entry] of Object.entries(servers)) {
    const { type, headers, ...rest } = entry;
    if (type !== undefined && type !== "stdio" && type !== "http")
      throw new RoleError(
        `${source}: mcpServers.${name}.type "${String(type)}" is not supported by Codex (stdio or http)`,
      );
    const server: Record<string, unknown> = { ...rest };
    if (headers !== undefined) {
      if (!record(headers))
        throw new RoleError(`${source}: mcpServers.${name}.headers must be an object`);
      server["http_headers"] = headers;
    }
    out[name] = server;
  }
  return out;
}
