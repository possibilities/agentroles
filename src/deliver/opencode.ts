import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RoleError } from "../errors.ts";
import { resolveBinary } from "../exec.ts";
import { toOpencodeMcpServers } from "../mcp.ts";
import type { Environ } from "../paths.ts";
import type { Role } from "../role.ts";

const OPENCODE_SCHEMA = "https://opencode.ai/config.json";
const OPENCODE_DEFAULT_AGENT = "build";
/** Refuse an unsupported prompt contract before writing or launching a role. */
export function assertOpencodeV2(env: Environ): void {
  const binary = resolveBinary("opencode", env);
  const result = Bun.spawnSync([binary, "--version"], {
    env: env as Record<string, string>,
    stdin: "ignore",
  });
  const output = new TextDecoder().decode(result.stdout).trim();
  const match = /^(?:opencode\s+)?v?(\d+)\.\d+\.\d+(?:[-+][\w.-]+)?$/.exec(output);
  if (result.exitCode !== 0 || Number(match?.[1]) !== 2)
    throw new RoleError(
      `unsupported OpenCode version from ${binary}: ${output || "no version reported"}`,
      "install OpenCode 2 as opencode; agentroles does not support OpenCode 1",
    );
}

/**
 * OpenCode has no argv for prompts, skills or MCP. V2 needs a private server so role config and the
 * append plugin cannot attach to an unrelated shared server.
 */
export function opencodeArguments(native: string[], hasRole = false): string[] {
  if (!hasRole) return native;
  if (
    native[0] === "attach" ||
    native.includes("--server") ||
    native.some((arg) => arg.startsWith("--server="))
  )
    throw new RoleError(
      "OpenCode 2 cannot deliver a process-local role to a separately running server",
      "launch a local OpenCode 2 session without attach or --server",
    );
  if (
    native[0] !== undefined &&
    [
      "acp",
      "api",
      "auth",
      "completion",
      "debug",
      "mcp",
      "models",
      "pair",
      "plugin",
      "providers",
      "reload",
      "serve",
      "service",
      "session",
      "stats",
      "uninstall",
      "update",
      "upgrade",
      "web",
    ].includes(native[0])
  )
    throw new RoleError(
      `OpenCode 2 ${native[0]} is a utility command, not a role session`,
      "run that utility directly, or use agentroles with opencode run, mini or the TUI",
    );
  if (native.includes("--standalone")) return native;
  if (native[0] === "run" || native[0] === "mini")
    return [native[0], "--standalone", ...native.slice(1)];
  // Default TUI invocation: `opencode [flags] [directory]`.
  return ["--standalone", ...native];
}

/**
 * Role files mapped onto the V2 config schema. Null for an empty
 * role. A server plugin adds
 * text to assembled agent-loop instructions without replacing the base prompt.
 * V2's plugin path must be a directory with an index.ts entrypoint.
 */
export function opencodeConfig(
  role: Role,
  appendPluginPath?: string,
): Record<string, unknown> | null {
  const config: Record<string, unknown> = { $schema: OPENCODE_SCHEMA };
  if (role.systemPrompt !== undefined)
    config["agents"] = {
      [OPENCODE_DEFAULT_AGENT]: {
        system: readFileSync(role.systemPrompt, "utf8"),
      },
    };
  if (role.appendSystemPrompt !== undefined) {
    if (appendPluginPath === undefined)
      throw new RoleError("OpenCode 2 append plugin path is missing");
    config["plugins"] = [appendPluginPath];
  }
  if (role.skillsRoot !== undefined) {
    config["skills"] = [role.skillsRoot];
    const command = opencodeSkillCommands(role);
    if (Object.keys(command).length > 0) config["commands"] = command;
  }
  if (role.mcpServers !== undefined && role.mcpPath !== undefined) {
    const servers = toOpencodeMcpServers(role.mcpServers, role.mcpPath);
    config["mcp"] = { servers };
  }
  return Object.keys(config).length > 1 ? config : null;
}

/** A V2 server plugin appends after the built-in agent prompt on every agent-loop request. */
export function opencodeAppendPlugin(role: Role): string {
  if (role.appendSystemPrompt === undefined) throw new RoleError("role has no append prompt");
  const text = readFileSync(role.appendSystemPrompt, "utf8");
  return `export default {\n  id: "agentroles.append",\n  async setup(ctx) {\n    const hook = await ctx.session.hook("context", (event) => {\n      event.system.push({ type: "text", text: ${JSON.stringify(text)} });\n    });\n    return () => hook.dispose();\n  },\n};\n`;
}

/** Clears a parent OPENCODE_CONFIG when the role has nothing to deliver. */
export function opencodeEnv(configPath: string | null): Record<string, string | undefined> {
  return { OPENCODE_CONFIG: configPath ?? undefined };
}

/**
 * The TUI slash menu skips skill-sourced commands. `commands` is the
 * native control that shows `/name`.
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
