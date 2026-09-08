import { describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { RoleError } from "../src/errors.ts";
import { listRoles, loadRole, resolveRolePath } from "../src/role.ts";
import { SKILL, sandbox } from "./fixtures/roles.ts";

describe("resolveRolePath", () => {
  test("names live under the roles home; anything path-like resolves from cwd", () => {
    const env = { AGENTROLES_HOME: "~/roles" };
    expect(resolveRolePath("researcher", env, "/h", "/cwd")).toBe("/h/roles/researcher");
    expect(resolveRolePath("researcher", {}, "/h", "/cwd")).toBe(
      "/h/.config/agentroles/researcher",
    );
    expect(resolveRolePath("./r", {}, "/h", "/cwd")).toBe("/cwd/r");
    expect(resolveRolePath("a/b", {}, "/h", "/cwd")).toBe("/cwd/a/b");
    expect(resolveRolePath("~/r", {}, "/h", "/cwd")).toBe("/h/r");
    expect(resolveRolePath("/abs", {}, "/h", "/cwd")).toBe("/abs");
    for (const bad of ["", "x.y", "-x", "a b"])
      expect(() => resolveRolePath(bad, {}, "/h", "/cwd")).toThrow(RoleError);
  });
});

describe("loadRole", () => {
  test("reads every file kind and validates skills and mcp.json", () => {
    const s = sandbox();
    try {
      const dir = s.role("full", {
        "APPEND_SYSTEM_PROMPT.md": "append",
        "VOICE_AGENT_SYSTEM_PROMPT.md": "voice",
        "VOICE_ORCHESTRATOR_MULTI_AGENT_MODE.md": "mode",
        "VOICE_ORCHESTRATOR_SESSION_START.md": "start",
        "skills/one/SKILL.md": SKILL,
        "skills/two/SKILL.md": SKILL,
        "mcp.json": JSON.stringify({ mcpServers: { srv: { command: "srv" } } }),
      });
      const role = loadRole(dir);
      expect(role).toEqual({
        name: "full",
        dir,
        appendSystemPrompt: join(dir, "APPEND_SYSTEM_PROMPT.md"),
        voice: {
          voiceSystem: join(dir, "VOICE_AGENT_SYSTEM_PROMPT.md"),
          multiAgentMode: join(dir, "VOICE_ORCHESTRATOR_MULTI_AGENT_MODE.md"),
          sessionStart: join(dir, "VOICE_ORCHESTRATOR_SESSION_START.md"),
        },
        skillsRoot: join(dir, "skills"),
        skillNames: ["one", "two"],
        mcpPath: join(dir, "mcp.json"),
        mcpServers: { srv: { command: "srv" } },
      });
      expect(loadRole(s.role("bare"))).toEqual({
        name: "bare",
        dir: join(s.roles, "bare"),
        voice: {},
        skillNames: [],
      });
      expect(listRoles(s.roles)).toEqual(["bare", "full"]);
      expect(listRoles(join(s.home, "nowhere"))).toEqual([]);
    } finally {
      s.cleanup();
    }
  });

  test("replace and append are exclusive per agent, after voice stand-ins", () => {
    const s = sandbox();
    try {
      const cases: Array<[string, string]> = [
        ["SYSTEM_PROMPT.md", "APPEND_SYSTEM_PROMPT.md"],
        ["VOICE_AGENT_SYSTEM_PROMPT.md", "VOICE_AGENT_APPEND_SYSTEM_PROMPT.md"],
        ["SYSTEM_PROMPT.md", "VOICE_ORCHESTRATOR_APPEND_SYSTEM_PROMPT.md"],
        ["APPEND_SYSTEM_PROMPT.md", "VOICE_ORCHESTRATOR_SYSTEM_PROMPT.md"],
        ["VOICE_ORCHESTRATOR_SYSTEM_PROMPT.md", "VOICE_ORCHESTRATOR_APPEND_SYSTEM_PROMPT.md"],
      ];
      cases.forEach(([a, b], index) => {
        const dir = s.role(`conflict-${index}`, { [a]: "a", [b]: "b" });
        expect(() => loadRole(dir)).toThrow("cannot both be present");
      });
      // Same kind: the voice file stands in, no conflict.
      const ok = s.role("ok", {
        "SYSTEM_PROMPT.md": "g",
        "VOICE_ORCHESTRATOR_SYSTEM_PROMPT.md": "v",
      });
      expect(loadRole(ok).voice.orchestratorSystem).toBe(
        join(ok, "VOICE_ORCHESTRATOR_SYSTEM_PROMPT.md"),
      );
    } finally {
      s.cleanup();
    }
  });

  test("present-but-broken files and malformed skills fail loudly", () => {
    const s = sandbox();
    try {
      const dir = s.role("broken");
      symlinkSync(join(dir, "missing"), join(dir, "SYSTEM_PROMPT.md"));
      expect(() => loadRole(dir)).toThrow("SYSTEM_PROMPT.md: cannot read");
      const modePrompt = s.role("modeprompt");
      symlinkSync(
        join(modePrompt, "missing"),
        join(modePrompt, "VOICE_ORCHESTRATOR_MULTI_AGENT_MODE.md"),
      );
      expect(() => loadRole(modePrompt)).toThrow(
        "VOICE_ORCHESTRATOR_MULTI_AGENT_MODE.md: cannot read",
      );
      const dirPrompt = s.role("dirprompt");
      mkdirSync(join(dirPrompt, "APPEND_SYSTEM_PROMPT.md"));
      expect(() => loadRole(dirPrompt)).toThrow("expected a regular file");
      const noSkill = s.role("noskill", { "skills/one/README.md": "x" });
      expect(() => loadRole(noSkill)).toThrow("has no SKILL.md");
      const badName = s.role("badname", { "skills/bad name/SKILL.md": SKILL });
      expect(() => loadRole(badName)).toThrow("must match");
      const fileInSkills = s.role("fileinskills", { "skills/stray.txt": "x" });
      expect(() => loadRole(fileInSkills)).toThrow("may only contain skill directories");
      const badMcp = s.role("badmcp", { "mcp.json": "{" });
      expect(() => loadRole(badMcp)).toThrow("not valid JSON");
      expect(() => loadRole(join(s.roles, "absent"))).toThrow("role directory not found");
      expect(() => loadRole("relative")).toThrow("must be absolute");
      if (process.getuid?.() !== 0) {
        const unreadable = s.role("unreadable", { "SYSTEM_PROMPT.md": "secret" });
        chmodSync(join(unreadable, "SYSTEM_PROMPT.md"), 0o000);
        try {
          expect(() => loadRole(unreadable)).toThrow("cannot read");
        } finally {
          chmodSync(join(unreadable, "SYSTEM_PROMPT.md"), 0o600);
        }
      }
      writeFileSync(join(s.roles, "not-a-dir"), "");
      expect(listRoles(s.roles)).not.toContain("not-a-dir");
    } finally {
      s.cleanup();
    }
  });
});
