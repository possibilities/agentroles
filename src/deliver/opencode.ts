import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RoleError } from "../errors.ts";
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
 * is a skills.paths root and each SKILL.md is also a `command` so `/<name>`
 * appears in the TUI slash menu; mcp.json is translated.
 */
export function opencodeConfig(role: Role): Record<string, unknown> | null {
  const config: Record<string, unknown> = { $schema: OPENCODE_SCHEMA };
  if (role.systemPrompt !== undefined)
    config["agent"] = {
      [OPENCODE_DEFAULT_AGENT]: { prompt: readFileSync(role.systemPrompt, "utf8") },
    };
  if (role.appendSystemPrompt !== undefined) config["instructions"] = [role.appendSystemPrompt];
  if (role.skillsRoot !== undefined) {
    config["skills"] = { paths: [role.skillsRoot] };
    const command = opencodeSkillCommands(role);
    if (Object.keys(command).length > 0) config["command"] = command;
  }
  if (role.mcpServers !== undefined && role.mcpPath !== undefined)
    config["mcp"] = toOpencodeMcpServers(role.mcpServers, role.mcpPath);
  return Object.keys(config).length > 1 ? config : null;
}

/** Clears a parent OPENCODE_CONFIG when the role has nothing to deliver. */
export function opencodeEnv(configPath: string | null): Record<string, string | undefined> {
  return { OPENCODE_CONFIG: configPath ?? undefined };
}

/**
 * OpenCode loads skills from skills.paths, but the TUI slash menu skips
 * skill-sourced commands. `command` is the native control that shows `/name`.
 */
function opencodeSkillCommands(
  role: Role,
): Record<string, { template: string; description?: string }> {
  const commands: Record<string, { template: string; description?: string }> = {};
  if (role.skillsRoot === undefined) return commands;
  for (const name of role.skillNames) {
    const skillDir = join(role.skillsRoot, name);
    const path = join(skillDir, "SKILL.md");
    let text: string;
    try {
      text = readFileSync(path, "utf8");
    } catch (error) {
      throw new RoleError(`SKILL.md: cannot read ${path}: ${String(error)}`);
    }
    const parsed = parseSkillMarkdown(text);
    const template = [
      parsed.body,
      "",
      `Base directory for this skill: ${skillDir}`,
      "Relative paths in this skill (e.g., scripts/, references/) are relative to this base directory.",
    ].join("\n");
    commands[name] =
      parsed.description === undefined
        ? { template }
        : { template, description: parsed.description };
  }
  return commands;
}

function parseSkillMarkdown(text: string): { description?: string; body: string } {
  const normalized = text.replaceAll("\r\n", "\n");
  if (!normalized.startsWith("---\n")) return { body: normalized.trim() };
  const end = normalized.indexOf("\n---", 4);
  if (end === -1) return { body: normalized.trim() };
  const after = normalized.slice(end + 4);
  if (after.length > 0 && !after.startsWith("\n")) return { body: normalized.trim() };
  const description = skillDescription(normalized.slice(4, end));
  const body = after.replace(/^\n/, "").trim();
  return description === undefined ? { body } : { description, body };
}

function skillDescription(frontmatter: string): string | undefined {
  for (const line of frontmatter.split("\n")) {
    const match = /^description:\s*(.*)$/.exec(line);
    if (match?.[1] === undefined) continue;
    let value = match[1].trim();
    if (value === "" || value === "|" || value === ">" || value === "|-" || value === ">-")
      return undefined;
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    )
      value = value.slice(1, -1);
    return value.length > 0 ? value : undefined;
  }
  return undefined;
}
