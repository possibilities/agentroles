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
