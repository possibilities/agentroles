import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { UsageError } from "../src/errors.ts";
import { main, parseCommand } from "../src/main.ts";
import { SKILL, sandbox } from "./fixtures/roles.ts";

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  const log = console.log;
  const error = console.error;
  console.log = (...args: unknown[]) => out.push(args.join(" "));
  console.error = (...args: unknown[]) => err.push(args.join(" "));
  return {
    out,
    err,
    restore() {
      console.log = log;
      console.error = error;
    },
  };
}

function codexCalls(log: string): unknown[] {
  return readFileSync(log, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}

describe("command grammar", () => {
  test("routes and rejects", () => {
    expect(parseCommand([])).toEqual({ kind: "help" });
    expect(parseCommand(["--version"])).toEqual({ kind: "version" });
    expect(parseCommand(["list"])).toEqual({ kind: "list" });
    expect(parseCommand(["show", "r"])).toEqual({ kind: "show", role: "r" });
    expect(parseCommand(["install", "r"])).toEqual({ kind: "install", role: "r" });
    expect(parseCommand(["r", "--", "claude", "-p", "x"])).toEqual({
      kind: "run",
      role: "r",
      command: ["claude", "-p", "x"],
    });
    for (const argv of [["r"], ["r", "claude"], ["r", "--"], ["--bogus"], ["list", "x"], ["show"]])
      expect(() => parseCommand(argv)).toThrow(UsageError);
  });
});

describe("main", () => {
  test("runs the harness through PATH with rendered arguments and passes its exit code back", async () => {
    const s = sandbox();
    const c = capture();
    try {
      const dir = s.role("r", {
        "APPEND_SYSTEM_PROMPT.md": "a",
        "skills/one/SKILL.md": SKILL,
        "mcp.json": JSON.stringify({ mcpServers: { srv: { command: "srv" } } }),
      });
      expect(await main(["r", "--", "claude", "-p", "hi"], s.env)).toBe(0);
      const log = readFileSync(s.env["FAKE_HARNESS_LOG"]!, "utf8").split("\n");
      const pluginDir = join(s.home, ".cache", "agentroles", "claude", "r");
      expect(log.slice(0, 8)).toEqual([
        "fake-harness",
        "--append-system-prompt-file",
        join(dir, "APPEND_SYSTEM_PROMPT.md"),
        "--mcp-config",
        join(dir, "mcp.json"),
        "--plugin-dir",
        pluginDir,
        "-p",
      ]);
      expect(log).toContain(`AGENTROLES_ROLE=${dir}`);
      expect(log).toContain("AGENTROLES_NAME=r");
      expect(existsSync(join(pluginDir, ".claude-plugin", "plugin.json"))).toBe(true);
      expect(existsSync(join(pluginDir, "skills", "one", "SKILL.md"))).toBe(true);

      expect(await main(["r", "--", "agentvoice", "--allow-full-access"], s.env)).toBe(0);
      expect(readFileSync(s.env["FAKE_HARNESS_LOG"]!, "utf8").split("\n").slice(0, 4)).toEqual([
        "fake-harness",
        "--role",
        dir,
        "--allow-full-access",
      ]);

      expect(await main(["r", "--", "claude"], { ...s.env, FAKE_HARNESS_EXIT: "7" })).toBe(7);
      expect(await main(["r", "--", "python"], s.env)).toBe(1);
      expect(c.err.at(-1)).toContain("not a supported harness");
      expect(await main(["absent", "--", "claude"], s.env)).toBe(1);
      expect(c.err.at(-1)).toContain("role directory not found");
      expect(await main(["r"], s.env)).toBe(64);
    } finally {
      c.restore();
      s.cleanup();
    }
  });

  test("codex: skills need `install`, which drives Codex's own plugin CLI and config editor", async () => {
    const s = sandbox();
    const c = capture();
    const codexLog = s.env["FAKE_CODEX_LOG"]!;
    try {
      s.role("r", { "skills/one/SKILL.md": SKILL, "APPEND_SYSTEM_PROMPT.md": "a" });
      expect(await main(["r", "--", "codex"], s.env)).toBe(1);
      expect(c.err.at(-1)).toContain("agentroles install r");

      expect(await main(["install", "r"], s.env)).toBe(0);
      const calls = codexCalls(codexLog);
      const root = join(s.home, ".cache", "agentroles", "codex-marketplace");
      expect(calls[0]).toEqual(["plugin", "marketplace", "list"]);
      expect(calls[1]).toEqual(["plugin", "marketplace", "add", root]);
      expect(calls[2]).toEqual(["plugin", "remove", "r@agentroles"]);
      expect(calls[3]).toEqual(["plugin", "add", "r@agentroles"]);
      expect(calls[4]).toEqual(["app-server", "--listen", "stdio://"]);
      expect(calls[5]).toMatchObject({ method: "initialize" });
      expect(calls[6]).toMatchObject({ method: "initialized" });
      expect(calls[7]).toMatchObject({
        method: "config/value/write",
        params: {
          keyPath: 'plugins."r@agentroles".enabled',
          value: false,
          mergeStrategy: "replace",
        },
      });
      const manifestPath = join(root, ".agents", "plugins", "marketplace.json");
      const marketplace = JSON.parse(readFileSync(manifestPath, "utf8"));
      expect(marketplace.name).toBe("agentroles");
      expect(marketplace.plugins.map((p: { name: string }) => p.name)).toEqual(["r"]);
      expect(existsSync(join(root, "plugins", "r", "skills", "one", "SKILL.md"))).toBe(true);
      expect(existsSync(join(root, "plugins", "r", ".codex-plugin", "plugin.json"))).toBe(true);

      // Installed: the launch enables the plugin per process, nothing else.
      expect(await main(["r", "--", "codex", "exec", "go"], s.env)).toBe(0);
      expect(codexCalls(codexLog).at(-1)).toEqual([
        "exec",
        "-c",
        'developer_instructions="a"',
        "-c",
        "plugins.r@agentroles.enabled=true",
        "go",
      ]);

      // A registered marketplace is not re-added; a second role joins the manifest.
      const before = codexCalls(codexLog).length;
      s.role("t", { "skills/two/SKILL.md": SKILL });
      expect(
        await main(["install", "t"], { ...s.env, FAKE_CODEX_MARKETPLACES: "agentroles" }),
      ).toBe(0);
      const added = codexCalls(codexLog)
        .slice(before)
        .filter((call) => Array.isArray(call) && call[1] === "marketplace" && call[2] === "add");
      expect(added).toEqual([]);
      const merged = JSON.parse(readFileSync(manifestPath, "utf8"));
      expect(merged.plugins.map((p: { name: string }) => p.name)).toEqual(["r", "t"]);

      expect(await main(["install", "r"], { ...s.env, FAKE_CODEX_ADD_FAIL: "1" })).toBe(1);
      expect(c.err.at(-1)).toContain("plugin add exploded");
      expect(await main(["install", "r"], { ...s.env, FAKE_CODEX_WRITE_FAIL: "1" })).toBe(1);
      expect(c.err.at(-1)).toContain("config/value/write failed");
      s.role("noskills");
      expect(await main(["install", "noskills"], s.env)).toBe(1);
      expect(c.err.at(-1)).toContain("has no skills/");
    } finally {
      c.restore();
      s.cleanup();
    }
  });

  test("list and show report without launching anything", async () => {
    const s = sandbox();
    const c = capture();
    try {
      expect(await main(["list"], s.env)).toBe(0);
      expect(c.out.at(-1)).toContain("no roles under");
      s.role("b", { "SYSTEM_PROMPT.md": "x" });
      s.role("a", { "skills/one/SKILL.md": SKILL });
      expect(await main(["list"], s.env)).toBe(0);
      expect(c.out.slice(-2)).toEqual(["a", "b"]);
      expect(await main(["show", "a"], s.env)).toBe(0);
      const shown = c.out.at(-1)!;
      expect(shown).toContain("skills: one");
      expect(shown).toContain("not installed (agentroles install)");
      expect(shown).toContain("codex: role a has skills but its Codex plugin");
      expect(shown).toContain("agentvoice: --role");
      expect(existsSync(s.env["FAKE_HARNESS_LOG"]!)).toBe(false);
      expect(await main(["--help"], s.env)).toBe(0);
      expect(await main(["--version"], s.env)).toBe(0);
    } finally {
      c.restore();
      s.cleanup();
    }
  });
});
