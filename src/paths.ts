import { homedir } from "node:os";
import { join, resolve } from "node:path";

export type Environ = Record<string, string | undefined>;

export function expandTilde(path: string, home: string): string {
  if (path === "~") return home;
  if (path.startsWith("~/")) return join(home, path.slice(2));
  return path;
}

/** Where named roles live. */
export function rolesHome(env: Environ, home = homedir()): string {
  const configured = env["AGENTROLES_HOME"];
  return configured ? expandTilde(configured, home) : join(home, ".config", "agentroles");
}

/** Rendered plugin directories, regenerated on demand; safe to delete. */
export function cacheHome(env: Environ, home = homedir()): string {
  const xdg = env["XDG_CACHE_HOME"];
  return join(xdg ? expandTilde(xdg, home) : join(home, ".cache"), "agentroles");
}

/** Codex's own state root, inherited unchanged; never created here. */
export function codexHome(env: Environ, home = homedir()): string {
  const configured = env["CODEX_HOME"];
  return configured ? resolve(expandTilde(configured, home)) : join(home, ".codex");
}
