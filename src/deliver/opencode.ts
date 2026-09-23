import { readFileSync } from "node:fs";
import { toOpencodeMcpServers } from "../mcp.ts";
import type { Role } from "../role.ts";

const OPENCODE_SCHEMA = "https://opencode.ai/config.json";
const OPENCODE_DEFAULT_AGENT = "build";

/**
 * OpenCode has no argv for prompts, skills or MCP. The native per-process
 * control is OPENCODE_CONFIG pointing at additional JSON, merged with global
 * and project config. User tokens pass through unchanged.
 */
export function opencodeArguments(native: string[]): string[] {
  return native;
}

/**
 * Role files mapped onto OpenCode's config schema. Null when the role has
 * nothing OpenCode can load. SYSTEM_PROMPT.md replaces the default `build`
 * agent's prompt; APPEND_SYSTEM_PROMPT.md is an instructions path; skills/
 * is a skills.paths root; mcp.json is translated.
 */
export function opencodeConfig(role: Role): Record<string, unknown> | null {
  const config: Record<string, unknown> = { $schema: OPENCODE_SCHEMA };
  if (role.systemPrompt !== undefined)
    config["agent"] = {
      [OPENCODE_DEFAULT_AGENT]: { prompt: readFileSync(role.systemPrompt, "utf8") },
    };
  if (role.appendSystemPrompt !== undefined) config["instructions"] = [role.appendSystemPrompt];
  if (role.skillsRoot !== undefined) config["skills"] = { paths: [role.skillsRoot] };
  if (role.mcpServers !== undefined && role.mcpPath !== undefined)
    config["mcp"] = toOpencodeMcpServers(role.mcpServers, role.mcpPath);
  return Object.keys(config).length > 1 ? config : null;
}

/** Clears a parent OPENCODE_CONFIG when the role has nothing to deliver. */
export function opencodeEnv(configPath: string | null): Record<string, string | undefined> {
  return { OPENCODE_CONFIG: configPath ?? undefined };
}
