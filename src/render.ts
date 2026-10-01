/**
 * Claude Code takes skills and monitors through a plugin directory. Each launch
 * owns its cache copy so another launch or show cannot replace a live plugin.
 */
import {
  copyFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { opencodeAppendPlugin, opencodeConfig } from "./deliver/opencode.ts";
import { RoleError } from "./errors.ts";
import type { Role } from "./role.ts";

export function claudePluginManifest(role: Role): Record<string, unknown> {
  return {
    name: role.name,
    version: "0.0.0",
    description: `agentroles role ${role.name} (${role.dir})`,
    author: { name: "agentroles" },
    ...(role.monitors === undefined ? {} : { experimental: { monitors: role.monitors } }),
  };
}

export function renderClaudePlugin(role: Role, cacheRoot: string, launch = false): string {
  const root = join(cacheRoot, "claude", role.name);
  mkdirSync(root, { recursive: true });
  const target = launch ? mkdtempSync(join(root, "launch-")) : join(root, "show");
  if (!launch) rmSync(target, { recursive: true, force: true });
  try {
    mkdirSync(join(target, ".claude-plugin"), { recursive: true });
    writeFileSync(
      join(target, ".claude-plugin", "plugin.json"),
      `${JSON.stringify(claudePluginManifest(role), null, 2)}\n`,
    );
    if (role.skillsRoot !== undefined)
      cpSync(role.skillsRoot, join(target, "skills"), { recursive: true, dereference: true });
    return target;
  } catch (error) {
    rmSync(target, { recursive: true, force: true });
    throw error;
  }
}

/**
 * OpenCode loads extra per-process config from OPENCODE_CONFIG. Regenerated
 * on every launch, never edited in place. Skills stay in the role directory;
 * the JSON and optional append plugin are written into cache.
 */
/** V2's server reads role config and plugin code; each private server gets its own files. */
export function renderOpencode(role: Role, cacheRoot: string): { path: string; directory: string } {
  const root = join(cacheRoot, "opencode", role.name);
  mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "launch-"));
  try {
    const pluginPath = join(directory, "append");
    if (role.appendSystemPrompt !== undefined) {
      mkdirSync(pluginPath);
      writeFileSync(join(pluginPath, "index.ts"), opencodeAppendPlugin(role));
    }
    const config = opencodeConfig(role, pluginPath);
    if (config === null) throw new RoleError("cannot render an empty OpenCode 2 role");
    const path = join(directory, "opencode.json");
    writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);
    return { path, directory };
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}

export const CODEX_MARKETPLACE = "agentroles";
export const CODEX_PLUGIN_VERSION = "0.0.0";

export function codexPluginManifest(role: Role): Record<string, unknown> {
  return {
    name: role.name,
    version: CODEX_PLUGIN_VERSION,
    description: `agentroles role ${role.name} (${role.dir})`,
    author: { name: "agentroles" },
    license: "UNLICENSED",
    keywords: ["agentroles", "skills"],
    skills: "./skills/",
    interface: {
      displayName: `Role: ${role.name}`,
      shortDescription: "Skills for one agentroles role; inert until a launch enables it.",
      longDescription: `Skills-only plugin rendered from ${role.dir}.`,
      developerName: "agentroles",
      category: "Developer Tools",
      capabilities: ["Skills"],
    },
  };
}

/**
 * One local marketplace lists every role that has ever been rendered here;
 * only roles the user installed are in Codex's plugin cache. The marketplace
 * root is stable so `codex plugin marketplace add` is done once.
 */
export function renderCodexMarketplace(role: Role, cacheRoot: string): string {
  const root = join(cacheRoot, "codex-marketplace");
  const pluginDir = join(root, "plugins", role.name);
  rmSync(pluginDir, { recursive: true, force: true });
  mkdirSync(join(pluginDir, ".codex-plugin"), { recursive: true });
  writeFileSync(
    join(pluginDir, ".codex-plugin", "plugin.json"),
    `${JSON.stringify(codexPluginManifest(role), null, 2)}\n`,
  );
  if (role.skillsRoot !== undefined)
    cpSync(role.skillsRoot, join(pluginDir, "skills"), { recursive: true, dereference: true });
  else mkdirSync(join(pluginDir, "skills"));
  const manifestDir = join(root, ".agents", "plugins");
  mkdirSync(manifestDir, { recursive: true });
  const manifestPath = join(manifestDir, "marketplace.json");
  const existing = readMarketplace(manifestPath);
  const plugins = existing.filter((entry) => entry["name"] !== role.name);
  plugins.push({
    name: role.name,
    source: { source: "local", path: `./plugins/${role.name}` },
    category: "Developer Tools",
    policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
  });
  plugins.sort((a, b) => String(a["name"]).localeCompare(String(b["name"])));
  writeFileSync(
    manifestPath,
    `${JSON.stringify(
      {
        name: CODEX_MARKETPLACE,
        interface: { displayName: "agentroles" },
        plugins,
      },
      null,
      2,
    )}\n`,
  );
  return root;
}

/** Devin plugin ids: lowercase alphanumerics with single "-" or "." separators. */
export const DEVIN_PLUGIN_NAME_PATTERN = /^[a-z0-9]+(?:[-.][a-z0-9]+)*$/;
export const DEVIN_PLUGIN_VERSION = "0.0.0";

export function devinPluginName(role: Role): string {
  if (!DEVIN_PLUGIN_NAME_PATTERN.test(role.name))
    throw new RoleError(
      `role "${role.name}" is not a valid Devin plugin name`,
      "Devin plugin names are lowercase letters, digits, and single '-' or '.' separators",
    );
  return role.name;
}

export function devinPluginDir(role: Role, cacheRoot: string): string {
  return join(cacheRoot, "devin", devinPluginName(role));
}

export function devinPluginManifest(role: Role): Record<string, unknown> {
  return {
    name: devinPluginName(role),
    version: DEVIN_PLUGIN_VERSION,
    description: `agentroles role ${role.name} (${role.dir})`,
    author: { name: "agentroles" },
  };
}

/**
 * Devin has no per-process plugin flag. A role becomes a plugin directory that
 * `devin plugins install --local` links at user level. Regenerated, never edited
 * in place.
 */
export function renderDevinPlugin(role: Role, cacheRoot: string): string {
  const name = devinPluginName(role);
  const prompt = role.systemPrompt ?? role.appendSystemPrompt;
  const hasSkills = role.skillsRoot !== undefined && role.skillNames.length > 0;
  const hasMcp = role.mcpPath !== undefined;
  if (prompt === undefined && !hasSkills && !hasMcp)
    throw new RoleError(
      `role ${role.name} has no prompt, skills/ or mcp.json; nothing to install for Devin`,
    );
  const target = join(cacheRoot, "devin", name);
  rmSync(target, { recursive: true, force: true });
  mkdirSync(join(target, ".devin-plugin"), { recursive: true });
  writeFileSync(
    join(target, ".devin-plugin", "plugin.json"),
    `${JSON.stringify(devinPluginManifest(role), null, 2)}\n`,
  );
  if (prompt !== undefined) writeFileSync(join(target, "AGENTS.md"), readFileSync(prompt));
  if (hasSkills && role.skillsRoot !== undefined)
    cpSync(role.skillsRoot, join(target, "skills"), { recursive: true, dereference: true });
  if (hasMcp && role.mcpPath !== undefined) copyFileSync(role.mcpPath, join(target, ".mcp.json"));
  return target;
}

function readMarketplace(path: string): Record<string, unknown>[] {
  try {
    const parsed = JSON.parse(require("node:fs").readFileSync(path, "utf8")) as {
      plugins?: unknown;
    };
    return Array.isArray(parsed.plugins)
      ? (parsed.plugins as Record<string, unknown>[]).filter(
          (entry) => typeof entry === "object" && entry !== null,
        )
      : [];
  } catch {
    return [];
  }
}
