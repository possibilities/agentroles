/**
 * Devin CLI has no per-process plugin enablement. `install --devin` renders a
 * plugin under the cache and installs it with Devin's own CLI as a sticky
 * user-level plugin for every session on this machine.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { RoleError } from "./errors.ts";
import { resolveBinary } from "./exec.ts";
import { cacheHome, type Environ } from "./paths.ts";
import {
  DEVIN_PLUGIN_NAME_PATTERN,
  devinPluginDir,
  devinPluginName,
  renderDevinPlugin,
} from "./render.ts";
import type { Role } from "./role.ts";

export function devinPluginRendered(role: Role, env: Environ, home: string): boolean {
  if (!DEVIN_PLUGIN_NAME_PATTERN.test(role.name)) return false;
  return existsSync(
    join(devinPluginDir(role, cacheHome(env, home)), ".devin-plugin", "plugin.json"),
  );
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
      result.stderr.includes("logged in") ? "run `devin auth login` and retry" : undefined,
    );
  return result;
}

export function installDevinPlugin(
  role: Role,
  env: Environ,
  home: string,
  log: (line: string) => void,
): void {
  const devin = resolveBinary("devin", env);
  const dir = renderDevinPlugin(role, cacheHome(env, home));
  const name = devinPluginName(role);
  log(`rendered ${dir}`);
  // A failed remove just means it was absent.
  run([devin, "plugins", "remove", "--local", name], env);
  must([devin, "plugins", "install", "--local", "--yes", dir], env, "devin plugins install");
  log(`installed ${name} for every Devin session on this machine`);
}
