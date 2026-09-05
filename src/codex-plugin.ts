/**
 * Codex CLI has no per-process skill root, so a role's skills reach it as a
 * plugin: installed once into Codex's plugin cache, kept disabled in global
 * config, and enabled per launch with `-c plugins.<name>@agentroles.enabled=true`.
 * `install` is the one command that writes Codex state, and it does so only
 * through Codex's own tooling: the plugin CLI and the config editor RPC.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { AppServerClient } from "./app-server.ts";
import { codexPluginId } from "./deliver/codex.ts";
import { RoleError } from "./errors.ts";
import { resolveBinary } from "./exec.ts";
import { cacheHome, codexHome, type Environ } from "./paths.ts";
import { CODEX_MARKETPLACE, renderCodexMarketplace } from "./render.ts";
import type { Role } from "./role.ts";

export function codexPluginInstalled(role: Role, env: Environ, home: string): boolean {
  return existsSync(join(codexHome(env, home), "plugins", "cache", CODEX_MARKETPLACE, role.name));
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
