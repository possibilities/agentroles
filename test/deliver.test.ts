import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { agentvoiceArguments } from "../src/deliver/agentvoice.ts";
import { claudeArguments } from "../src/deliver/claude.ts";
import { codexArguments, codexCommandIndex, codexOverrides } from "../src/deliver/codex.ts";
import { fxArguments } from "../src/deliver/fx.ts";
import { opencodeArguments, opencodeConfig } from "../src/deliver/opencode.ts";
import { RoleError } from "../src/errors.ts";
import { cacheHome } from "../src/paths.ts";
import { renderDevinPlugin } from "../src/render.ts";
import { loadRole } from "../src/role.ts";
import { SKILL, sandbox } from "./fixtures/roles.ts";

describe("deliveries", () => {
  test("claude: prompt flags, mcp.json as is, rendered plugin dir, then the user's tokens", () => {
    const s = sandbox();
    try {
      const dir = s.role("r", {
        "APPEND_SYSTEM_PROMPT.md": "a",
        "mcp.json": JSON.stringify({ mcpServers: { srv: { command: "srv" } } }),
        "skills/one/SKILL.md": SKILL,
      });
      const role = loadRole(dir);
      expect(claudeArguments(role, "/cache/claude/r", ["-p", "hi"])).toEqual([
        "--append-system-prompt-file",
        join(dir, "APPEND_SYSTEM_PROMPT.md"),
        "--mcp-config",
        join(dir, "mcp.json"),
        "--plugin-dir",
        "/cache/claude/r",
        "-p",
        "hi",
      ]);
      const replace = loadRole(s.role("s", { "SYSTEM_PROMPT.md": "x" }));
      expect(claudeArguments(replace, null, [])).toEqual([
        "--system-prompt-file",
        join(s.roles, "s", "SYSTEM_PROMPT.md"),
      ]);
      expect(agentvoiceArguments(role, ["--allow-full-access"])).toEqual([
        "--role",
        dir,
        "--allow-full-access",
      ]);
      expect(fxArguments(role, ["ask", "hi"])).toEqual([
        "--append-system-prompt-file",
        join(dir, "APPEND_SYSTEM_PROMPT.md"),
        "--mcp-config",
        join(dir, "mcp.json"),
        "--skills-dir",
        join(dir, "skills"),
        "--no-default-skills",
        "ask",
        "hi",
      ]);
      expect(fxArguments(replace, [])).toEqual([
        "--system-prompt-file",
        join(s.roles, "s", "SYSTEM_PROMPT.md"),
      ]);
      expect(fxArguments(loadRole(s.role("empty")), [])).toEqual([]);
      expect(opencodeArguments(["run", "hi"])).toEqual(["run", "hi"]);
      expect(opencodeConfig(role)).toEqual({
        $schema: "https://opencode.ai/config.json",
        instructions: [join(dir, "APPEND_SYSTEM_PROMPT.md")],
        skills: { paths: [join(dir, "skills")] },
        command: {
          one: {
            template: [
              "Do the thing.",
              "",
              `Base directory for this skill: ${join(dir, "skills", "one")}`,
              "Relative paths in this skill (e.g., scripts/, references/) are relative to this base directory.",
            ].join("\n"),
            description: "A test skill.",
          },
        },
        mcp: { srv: { type: "local", command: ["srv"] } },
      });
      expect(opencodeConfig(replace)).toEqual({
        $schema: "https://opencode.ai/config.json",
        agent: { build: { prompt: "x" } },
      });
      expect(opencodeConfig(loadRole(s.role("empty")))).toBeNull();
      const quoted = loadRole(
        s.role("quoted", {
          "skills/collab/SKILL.md":
            '---\nname: collab\ndescription: "Work with the human."\n---\nStay in conversation.\n',
          "skills/bare/SKILL.md": "Just the body.\n",
        }),
      );
      const commands = opencodeConfig(quoted)?.["command"] as Record<
        string,
        { description?: string }
      >;
      expect(commands["collab"]?.description).toBe("Work with the human.");
      expect(commands["bare"]?.description).toBeUndefined();
    } finally {
      s.cleanup();
    }
  });

  test("codex: TOML overrides that its -c parser accepts; skills need the installed plugin", () => {
    const s = sandbox();
    try {
      const dir = s.role("r", {
        "APPEND_SYSTEM_PROMPT.md": 'line "one"\nline two\n',
        "mcp.json": JSON.stringify({
          mcpServers: { docs: { type: "http", url: "https://x.test", headers: { K: "v" } } },
        }),
        "skills/one/SKILL.md": SKILL,
      });
      const role = loadRole(dir);
      expect(() => codexOverrides(role, false)).toThrow(RoleError);
      const overrides = codexOverrides(role, true);
      expect(overrides.filter((_, index) => index % 2 === 0)).toEqual(["-c", "-c", "-c"]);
      const values = overrides.filter((_, index) => index % 2 === 1);
      expect(values[2]).toBe("plugins.r@agentroles.enabled=true");
      const parsed = Object.fromEntries(
        values.slice(0, 2).map((entry) => {
          const equals = entry.indexOf("=");
          const parsedValue = Bun.TOML.parse(`v = ${entry.slice(equals + 1)}`) as { v: unknown };
          return [entry.slice(0, equals), parsedValue.v];
        }),
      );
      expect(parsed).toEqual({
        developer_instructions: 'line "one"\nline two\n',
        "mcp_servers.docs": { url: "https://x.test", http_headers: { K: "v" } },
      });
      const replace = loadRole(s.role("s", { "SYSTEM_PROMPT.md": "x" }));
      expect(codexOverrides(replace, false)).toEqual([
        "-c",
        `model_instructions_file="${join(s.roles, "s", "SYSTEM_PROMPT.md")}"`,
      ]);
      expect(codexOverrides(loadRole(s.role("empty")), false)).toEqual([]);
    } finally {
      s.cleanup();
    }
  });

  test("codex: overrides lead an interactive launch and follow exec/review or resume <id>", () => {
    const o = ["-c", "k=v"];
    expect(codexArguments(o, [])).toEqual(o);
    expect(codexArguments(o, ["fix it"])).toEqual([...o, "fix it"]);
    expect(codexArguments(o, ["exec", "fix it"])).toEqual(["exec", ...o, "fix it"]);
    expect(codexArguments(o, ["-m", "gpt-x", "exec", "p"])).toEqual([
      "-m",
      "gpt-x",
      "exec",
      ...o,
      "p",
    ]);
    expect(codexArguments(o, ["resume", "abc", "--last"])).toEqual([
      "resume",
      "abc",
      ...o,
      "--last",
    ]);
    expect(codexArguments(o, ["resume"])).toEqual([...o, "resume"]);
    expect(codexCommandIndex(["--", "exec"])).toBeNull();
    expect(codexCommandIndex(["-cfoo=bar", "review"])).toBe(1);
  });

  test("devin: plugin directory with AGENTS.md, skills and .mcp.json", () => {
    const s = sandbox();
    try {
      const dir = s.role("r", {
        "SYSTEM_PROMPT.md": "sys\n",
        "mcp.json": JSON.stringify({ mcpServers: { srv: { command: "srv" } } }),
        "skills/one/SKILL.md": SKILL,
      });
      const role = loadRole(dir);
      const pluginDir = renderDevinPlugin(role, cacheHome(s.env, s.home));
      expect(pluginDir).toBe(join(s.home, ".cache", "agentroles", "devin", "r"));
      expect(readFileSync(join(pluginDir, "AGENTS.md"), "utf8")).toBe("sys\n");
      expect(existsSync(join(pluginDir, "skills", "one", "SKILL.md"))).toBe(true);
      expect(existsSync(join(pluginDir, ".mcp.json"))).toBe(true);
      expect(() =>
        renderDevinPlugin(
          loadRole(s.role("bad_name", { "SYSTEM_PROMPT.md": "x" })),
          cacheHome(s.env, s.home),
        ),
      ).toThrow(RoleError);
    } finally {
      s.cleanup();
    }
  });
});
