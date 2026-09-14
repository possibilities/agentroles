/**
 * Codex CLI has no per-process skill root, so a role's skills reach it as a
 * plugin: installed once into Codex's plugin cache, kept disabled in global
 * config, and enabled per launch with `-c plugins.<name>@agentroles.enabled=true`.
 * `install` is the one command that writes Codex state, and it does so only
 * through Codex's own tooling: the plugin CLI and the config editor RPC.
 */
import { type Dirent, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { AppServerClient } from "./app-server.ts";
import { codexPluginId } from "./deliver/codex.ts";
import { RoleError } from "./errors.ts";
import { resolveBinary } from "./exec.ts";
import { cacheHome, codexHome, type Environ } from "./paths.ts";
import { CODEX_MARKETPLACE, CODEX_PLUGIN_VERSION, renderCodexMarketplace } from "./render.ts";
import type { Role } from "./role.ts";

export function codexPluginInstalled(role: Role, env: Environ, home: string): boolean {
  return existsSync(join(codexHome(env, home), "plugins", "cache", CODEX_MARKETPLACE, role.name));
}

export interface CodexPluginFreshness {
  schema_version: 1;
  role: string;
  plugin: string;
  installed: boolean;
  fresh: boolean;
  /** Paths are relative to skills/ and never contain file contents. */
  missing: string[];
  extra: string[];
  changed: string[];
}

interface TreeSnapshot {
  files: Map<string, Buffer>;
  directories: Set<string>;
}

function snapshotTree(root: string): TreeSnapshot {
  const snapshot: TreeSnapshot = { files: new Map(), directories: new Set() };
  if (!existsSync(root)) return snapshot;

  function visit(dir: string, prefix: string): void {
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
        a.name.localeCompare(b.name),
      );
    } catch (error) {
      throw new RoleError(`cannot read Codex plugin tree ${dir}: ${String(error)}`);
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      let stat: ReturnType<typeof statSync>;
      try {
        // Follow links because install renders role skills with dereference=true.
        stat = statSync(path);
      } catch (error) {
        throw new RoleError(`cannot read Codex plugin tree ${path}: ${String(error)}`);
      }
      if (stat.isDirectory()) {
        snapshot.directories.add(relativePath);
        visit(path, relativePath);
      } else if (stat.isFile()) {
        try {
          snapshot.files.set(relativePath, readFileSync(path));
        } catch (error) {
          throw new RoleError(`cannot read Codex plugin tree ${path}: ${String(error)}`);
        }
      } else {
        throw new RoleError(
          `cannot compare Codex plugin tree ${path}: expected a file or directory`,
        );
      }
    }
  }

  visit(root, "");
  return snapshot;
}

/** Compare the role's current skills with Codex's installed copy, without writing state. */
export function checkCodexPlugin(role: Role, env: Environ, home: string): CodexPluginFreshness {
  if (role.skillsRoot === undefined || role.skillNames.length === 0)
    throw new RoleError(`role ${role.name} has no skills/; nothing to install for Codex`);

  const versionRoot = join(
    codexHome(env, home),
    "plugins",
    "cache",
    CODEX_MARKETPLACE,
    role.name,
    CODEX_PLUGIN_VERSION,
  );
  const installed = existsSync(versionRoot);
  const current = snapshotTree(role.skillsRoot);
  const copy = snapshotTree(join(versionRoot, "skills"));
  const missing: string[] = [];
  const extra: string[] = [];
  const changed = new Set<string>();

  for (const [path, contents] of current.files) {
    const copied = copy.files.get(path);
    if (copied !== undefined) {
      if (!contents.equals(copied)) changed.add(path);
    } else if (copy.directories.has(path)) changed.add(path);
    else missing.push(path);
  }
  for (const path of current.directories) {
    if (copy.files.has(path)) changed.add(path);
    else if (!copy.directories.has(path)) missing.push(path);
  }
  for (const path of copy.files.keys()) {
    if (current.files.has(path)) continue;
    if (current.directories.has(path)) changed.add(path);
    else extra.push(path);
  }
  for (const path of copy.directories) {
    if (current.files.has(path)) changed.add(path);
    else if (!current.directories.has(path)) extra.push(path);
  }

  missing.sort();
  extra.sort();
  const changedPaths = [...changed].sort();
  return {
    schema_version: 1,
    role: role.name,
    plugin: codexPluginId(role),
    installed,
    fresh: installed && missing.length === 0 && extra.length === 0 && changedPaths.length === 0,
    missing,
    extra,
    changed: changedPaths,
  };
}

interface Run {
  code: number;
  stdout: string;
  stderr: string;
}

function run(cmd: string[], env: Environ): Run {
  const result = Bun.spawnSync(cmd, { env: env as Record<string, string>, stdin: "ignore" });
  return {
    code: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

function must(cmd: string[], env: Environ, what: string): Run {
  const result = run(cmd, env);
  if (result.code !== 0)
    throw new RoleError(
      `${what} failed (exit ${result.code}): ${result.stderr.trim() || result.stdout.trim()}`,
    );
  return result;
}

export async function installCodexPlugin(
  role: Role,
  env: Environ,
  home: string,
  log: (line: string) => void,
): Promise<void> {
  if (role.skillNames.length === 0)
    throw new RoleError(`role ${role.name} has no skills/; nothing to install for Codex`);
  const codex = resolveBinary("codex", env);
  const root = renderCodexMarketplace(role, cacheHome(env, home));
  log(`rendered ${root}/plugins/${role.name}`);

  const marketplaces = must(
    [codex, "plugin", "marketplace", "list"],
    env,
    "codex plugin marketplace list",
  );
  const registered = marketplaces.stdout
    .split("\n")
    .some((line) => line.trim().split(/\s+/)[0] === CODEX_MARKETPLACE);
  if (!registered) {
    must([codex, "plugin", "marketplace", "add", root], env, "codex plugin marketplace add");
    log(`registered marketplace ${CODEX_MARKETPLACE} at ${root}`);
  }

  const id = codexPluginId(role);
  // Reinstall refreshes Codex's copy of the skills; a failed remove just means it was absent.
  run([codex, "plugin", "remove", id], env);
  must([codex, "plugin", "add", id], env, `codex plugin add ${id}`);
  log(`installed ${id}`);

  const client = new AppServerClient(codex, env);
  try {
    await client.initialize();
    await client.request("config/value/write", {
      keyPath: `plugins."${id}".enabled`,
      value: false,
      mergeStrategy: "replace",
    });
  } finally {
    await client.close();
  }
  log(`${id} is installed and disabled globally; launches enable it per process`);
}
