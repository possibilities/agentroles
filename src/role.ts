/**
 * A role is a directory. Every file maps to one native control of the
 * harness it is delivered to; nothing here is an agentroles-shaped overlay.
 *
 *   SYSTEM_PROMPT.md | APPEND_SYSTEM_PROMPT.md       the agent's prompt
 *   skills/<name>/SKILL.md                            skills
 *   mcp.json                                          MCP servers (.mcp.json shape)
 *   VOICE_AGENT_SYSTEM_PROMPT.md | VOICE_AGENT_APPEND_SYSTEM_PROMPT.md
 *   VOICE_ORCHESTRATOR_SYSTEM_PROMPT.md | VOICE_ORCHESTRATOR_APPEND_SYSTEM_PROMPT.md
 *   VOICE_ORCHESTRATOR_SESSION_START.md, VOICE_ORCHESTRATOR_SESSION_END.md
 *
 * The VOICE_* files are AgentVoice's superset and are validated here only so
 * a broken role fails before any harness starts.
 */
import { existsSync, lstatSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, isAbsolute, join, resolve } from "node:path";
import { RoleError } from "./errors.ts";
import { type McpServers, parseMcpServers } from "./mcp.ts";
import { type Environ, expandTilde, rolesHome } from "./paths.ts";

/** Names survive as unquoted Codex config key segments and plugin ids. */
export const ROLE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
export const SKILL_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;

export const PROMPT_FILES = {
  system: "SYSTEM_PROMPT.md",
  append: "APPEND_SYSTEM_PROMPT.md",
} as const;

export const VOICE_FILES = {
  voiceSystem: "VOICE_AGENT_SYSTEM_PROMPT.md",
  voiceAppend: "VOICE_AGENT_APPEND_SYSTEM_PROMPT.md",
  orchestratorSystem: "VOICE_ORCHESTRATOR_SYSTEM_PROMPT.md",
  orchestratorAppend: "VOICE_ORCHESTRATOR_APPEND_SYSTEM_PROMPT.md",
  multiAgentMode: "VOICE_ORCHESTRATOR_MULTI_AGENT_MODE.md",
  sessionStart: "VOICE_ORCHESTRATOR_SESSION_START.md",
  sessionEnd: "VOICE_ORCHESTRATOR_SESSION_END.md",
} as const;

export const MCP_FILE = "mcp.json";
export const SKILLS_DIR = "skills";

export interface Role {
  name: string;
  dir: string;
  /** Absolute path of the general replacement or append prompt, at most one. */
  systemPrompt?: string;
  appendSystemPrompt?: string;
  /** AgentVoice's superset, present names only. */
  voice: Partial<Record<keyof typeof VOICE_FILES, string>>;
  skillsRoot?: string;
  skillNames: string[];
  mcpPath?: string;
  mcpServers?: McpServers;
}

/** A path when it looks like one; otherwise a name under the roles home. */
export function resolveRolePath(spec: string, env: Environ, home: string, cwd: string): string {
  const trimmed = spec.trim();
  if (!trimmed) throw new RoleError("role must be a non-empty name or directory path");
  if (trimmed.includes("/") || trimmed.startsWith(".") || trimmed.startsWith("~"))
    return resolve(cwd, expandTilde(trimmed, home));
  if (!ROLE_NAME_PATTERN.test(trimmed))
    throw new RoleError(
      `role "${trimmed}" is neither a directory path nor a name (letters, digits, "_" and "-")`,
    );
  return join(rolesHome(env, home), trimmed);
}

function presentFile(path: string, filename: string): string | undefined {
  let exists: boolean;
  try {
    lstatSync(path);
    exists = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new RoleError(`${filename}: cannot read ${path}: ${String(error)}`);
  }
  if (!exists) return undefined;
  try {
    if (!statSync(path).isFile()) throw new Error("expected a regular file");
    readFileSync(path);
  } catch (error) {
    throw new RoleError(`${filename}: cannot read ${path}: ${String(error)}`);
  }
  return path;
}

function exclusive(dir: string, a: string | undefined, b: string | undefined): void {
  if (a !== undefined && b !== undefined)
    throw new RoleError(
      `${basename(a)} and ${basename(b)} cannot both be present in ${dir}: choose a replacement or an append`,
    );
}

export function loadRole(dir: string): Role {
  if (!isAbsolute(dir)) throw new RoleError(`role directory must be absolute: ${dir}`);
  let isDirectory = false;
  try {
    isDirectory = statSync(dir).isDirectory();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT")
      throw new RoleError(`cannot read role directory ${dir}: ${String(error)}`);
  }
  if (!isDirectory)
    throw new RoleError(
      `role directory not found: ${dir}`,
      "name a directory under $AGENTROLES_HOME (default ~/.config/agentroles) or give a path",
    );
  const name = basename(dir);
  const role: Role = { name, dir, voice: {}, skillNames: [] };

  const system = presentFile(join(dir, PROMPT_FILES.system), PROMPT_FILES.system);
  const append = presentFile(join(dir, PROMPT_FILES.append), PROMPT_FILES.append);
  exclusive(dir, system, append);
  if (system !== undefined) role.systemPrompt = system;
  if (append !== undefined) role.appendSystemPrompt = append;

  for (const [key, filename] of Object.entries(VOICE_FILES) as [
    keyof typeof VOICE_FILES,
    string,
  ][]) {
    const path = presentFile(join(dir, filename), filename);
    if (path !== undefined) role.voice[key] = path;
  }
  exclusive(dir, role.voice.voiceSystem, role.voice.voiceAppend);
  // AgentVoice lets the voice-specific file stand in for the general one of
  // the same kind, then requires one replacement or one append to remain.
  exclusive(dir, role.voice.orchestratorSystem ?? system, role.voice.orchestratorAppend ?? append);

  const skillsRoot = join(dir, SKILLS_DIR);
  if (existsSync(skillsRoot)) {
    if (!statSync(skillsRoot).isDirectory())
      throw new RoleError(`${skillsRoot} must be a directory of <name>/SKILL.md`);
    const names = readdirSync(skillsRoot, { withFileTypes: true })
      .filter((entry) => !entry.name.startsWith("."))
      .map((entry) => entry.name)
      .sort();
    for (const skill of names) {
      const skillDir = join(skillsRoot, skill);
      if (!statSync(skillDir).isDirectory())
        throw new RoleError(`${skillDir}: skills/ may only contain skill directories`);
      if (!SKILL_NAME_PATTERN.test(skill))
        throw new RoleError(`skill name "${skill}" must match ${SKILL_NAME_PATTERN}`);
      if (!existsSync(join(skillDir, "SKILL.md")))
        throw new RoleError(`${skillDir} has no SKILL.md`);
    }
    role.skillsRoot = skillsRoot;
    role.skillNames = names;
  }

  const mcpPath = presentFile(join(dir, MCP_FILE), MCP_FILE);
  if (mcpPath !== undefined) {
    role.mcpPath = mcpPath;
    role.mcpServers = parseMcpServers(readFileSync(mcpPath, "utf8"), mcpPath);
  }
  return role;
}

export function listRoles(home: string): string[] {
  if (!existsSync(home)) return [];
  return readdirSync(home, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && ROLE_NAME_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}
