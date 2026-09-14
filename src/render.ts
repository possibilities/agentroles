/**
 * Claude Code takes skills only as a plugin directory, so the role's skills
 * are rendered into one under the cache on every launch: a manifest naming
 * the role plus a fresh copy of skills/. Regenerated, never edited in place.
 */
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Role } from "./role.ts";

export function claudePluginManifest(role: Role): Record<string, unknown> {
  return {
    name: role.name,
    version: "0.0.0",
    description: `agentroles role ${role.name} (${role.dir})`,
    author: { name: "agentroles" },
  };
}

export function renderClaudePlugin(role: Role, cacheRoot: string): string {
  const target = join(cacheRoot, "claude", role.name);
  rmSync(target, { recursive: true, force: true });
  mkdirSync(join(target, ".claude-plugin"), { recursive: true });
  writeFileSync(
    join(target, ".claude-plugin", "plugin.json"),
    `${JSON.stringify(claudePluginManifest(role), null, 2)}\n`,
  );
  if (role.skillsRoot !== undefined)
    cpSync(role.skillsRoot, join(target, "skills"), { recursive: true, dereference: true });
  return target;
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
