import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/** A disposable home with a roles directory, a cache, a fake CODEX_HOME and a PATH of fakes. */
export function sandbox() {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "agentroles-test-")));
  const roles = join(home, ".config", "agentroles");
  mkdirSync(roles, { recursive: true });
  const bin = join(home, "bin");
  mkdirSync(bin);
  const fixtures = join(import.meta.dir);
  for (const [name, source] of [
    ["claude", "fake-harness"],
    ["agentvoice", "fake-harness"],
    ["fx", "fake-harness"],
    ["opencode", "fake-harness"],
    ["codex", "fake-codex"],
    ["devin", "fake-devin"],
  ] as const) {
    writeFileSync(join(bin, name), `#!/usr/bin/env bash\nexec "${join(fixtures, source)}" "$@"\n`, {
      mode: 0o755,
    });
  }
  const env: Record<string, string> = {
    HOME: home,
    PATH: `${bin}:${process.env["PATH"] ?? ""}`,
    AGENTROLES_HOME: roles,
    XDG_CACHE_HOME: join(home, ".cache"),
    CODEX_HOME: join(home, ".codex"),
    FAKE_HARNESS_LOG: join(home, "harness.log"),
    FAKE_CODEX_LOG: join(home, "codex.log"),
    FAKE_DEVIN_LOG: join(home, "devin.log"),
  };
  const role = (name: string, files: Record<string, string> = {}) => {
    const dir = join(roles, name);
    mkdirSync(dir, { recursive: true });
    for (const [file, text] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, file)), { recursive: true });
      writeFileSync(join(dir, file), text);
    }
    return dir;
  };
  return {
    home,
    roles,
    env,
    role,
    cleanup: () => rmSync(home, { recursive: true, force: true }),
  };
}

export const SKILL = "---\nname: one\ndescription: A test skill.\n---\nDo the thing.\n";
