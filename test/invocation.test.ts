import { expect, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SKILL, sandbox } from "./fixtures/roles.ts";

const cli = join(import.meta.dir, "..", "src", "main.ts");
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function sessionSandbox() {
  const s = sandbox();
  for (const name of ["claude", "codex", "opencode"])
    writeFileSync(
      join(s.home, "bin", name),
      `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(join(import.meta.dir, "fixtures", "fake-session.ts"))} "$@"\n`,
      { mode: 0o755 },
    );
  return s;
}

function launch(env: Record<string, string>, role: string, harness: string, ...args: string[]) {
  return Bun.spawn([process.execPath, cli, role, "--", harness, ...args], {
    env,
    cwd: env["HOME"]!,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
}

function receipt(log: string) {
  return JSON.parse(readFileSync(log, "utf8"));
}

async function ready(log: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (!existsSync(log)) {
    if (Date.now() > deadline) throw new Error(`fake harness never wrote ${log}`);
    await Bun.sleep(10);
  }
}

test("Claude monitor-only role delivers native declarations and one owner environment to its children", async () => {
  const s = sessionSandbox();
  try {
    const envCapture = join(import.meta.dir, "fixtures", "capture-env.ts");
    const monitors = [
      {
        name: "completion",
        command: `${JSON.stringify(process.execPath)} ${JSON.stringify(envCapture)} "\${HOME}" "\${CLAUDE_PLUGIN_ROOT}"`,
        description: "Child completions",
        when: "always",
      },
      {
        name: "log",
        command: `${JSON.stringify(process.execPath)} ${JSON.stringify(envCapture)}`,
        description: "Session log",
      },
    ];
    const role = s.role("monitor", { "monitors.json": JSON.stringify(monitors) });
    const log = join(s.home, "session.json");
    const first = launch({ ...s.env, FAKE_SESSION_LOG: log }, role, "claude");
    expect(await first.exited).toBe(0);
    const result = receipt(log);
    expect(result.manifest.experimental.monitors).toEqual(monitors);
    expect(result.skill).toBe(false);
    expect(result.invocation).toMatch(uuid);
    expect(result.monitors).toEqual([
      { invocation: result.invocation, harness: "claude", role, name: "monitor" },
      { invocation: result.invocation, harness: "claude", role, name: "monitor" },
    ]);
    expect(existsSync(result.plugin)).toBe(false);

    s.role("monitor", {
      "monitors.json": JSON.stringify([{ ...monitors[0], when: "on-skill-invoke:bridge" }]),
    });

    s.role("monitor", {
      "mcp.json": JSON.stringify({
        mcpServers: { bridge: { command: process.execPath, args: [envCapture] } },
      }),
    });
    const second = launch({ ...s.env, FAKE_SESSION_LOG: log }, role, "claude");
    expect(await second.exited).toBe(0);
    const shared = receipt(log);
    expect(shared.mcp).toEqual(shared.monitors);
    expect(shared.invocation).not.toBe(result.invocation);
    expect(shared.manifest.experimental.monitors[0].when).toBe("on-skill-invoke:bridge");
  } finally {
    s.cleanup();
  }
});

test("concurrent Claude launches and show never replace a live plugin or reuse invocation IDs", async () => {
  const s = sessionSandbox();
  const children: ReturnType<typeof launch>[] = [];
  try {
    const role = s.role("r", {
      "skills/one/SKILL.md": SKILL,
      "monitors.json": "[]",
    });
    const release = join(s.home, "release");
    const logs = [join(s.home, "first.json"), join(s.home, "second.json")];
    for (const [index, log] of logs.entries()) {
      if (index === 1)
        s.role("r", {
          "monitors.json": JSON.stringify([
            {
              name: "updated",
              command: `${JSON.stringify(process.execPath)} ${JSON.stringify(join(import.meta.dir, "fixtures", "capture-env.ts"))}`,
              description: "Updated role monitor",
            },
          ]),
        });
      children.push(
        launch({ ...s.env, FAKE_SESSION_LOG: log, FAKE_SESSION_RELEASE: release }, role, "claude"),
      );
      await ready(log);
    }
    const [first, second] = logs.map(receipt);
    expect(first.plugin).not.toBe(second.plugin);
    expect(first.invocation).toMatch(uuid);
    expect(second.invocation).toMatch(uuid);
    expect(first.invocation).not.toBe(second.invocation);
    expect(first.skill).toBe(true);
    expect(second.skill).toBe(true);
    const show = Bun.spawn([process.execPath, cli, "show", role], {
      env: s.env,
      cwd: s.home,
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(await show.exited).toBe(0);
    const shown = await new Response(show.stdout).text();
    expect(shown).not.toContain("AGENTROLES_INVOCATION_ID");
    expect(shown).toContain("monitors (Claude only): updated");
    expect(existsSync(first.plugin)).toBe(true);
    expect(existsSync(second.plugin)).toBe(true);
    writeFileSync(release, "");
    expect(await Promise.all(children.map((child) => child.exited))).toEqual([0, 0]);
    expect(logs.map((log) => receipt(log).pluginIntact)).toEqual([true, true]);
    expect(existsSync(first.plugin)).toBe(false);
    expect(existsSync(second.plugin)).toBe(false);
  } finally {
    for (const child of children) {
      if (child.exitCode === null) child.kill();
      await child.exited;
    }
    s.cleanup();
  }
});

test("every run replaces inherited correlation, including a nested native harness launch", async () => {
  const s = sessionSandbox();
  try {
    const monitored = s.role("monitored", {
      "monitors.json": JSON.stringify([
        {
          name: "watch",
          command: `${JSON.stringify(process.execPath)} ${JSON.stringify(join(import.meta.dir, "fixtures", "capture-env.ts"))}`,
          description: "Session changes",
        },
      ]),
    });
    const ids: string[] = [];
    for (const harness of ["claude", "codex", "opencode"]) {
      const log = join(s.home, `${harness}.json`);
      const child = launch(
        {
          ...s.env,
          FAKE_SESSION_LOG: log,
          AGENTROLES_INVOCATION_ID: "inherited-owner",
          AGENTROLES_HARNESS: "inherited-harness",
        },
        monitored,
        harness,
      );
      expect(await child.exited).toBe(0);
      const result = receipt(log);
      expect(result.invocation).toMatch(uuid);
      expect(result.harness).toBe(harness);
      if (harness !== "claude") expect(result.args).toEqual([]);
      ids.push(result.invocation);
    }
    expect(new Set(ids).size).toBe(3);

    const empty = s.role("empty");
    const emptyLog = join(s.home, "empty.json");
    const emptyRun = launch({ ...s.env, FAKE_SESSION_LOG: emptyLog }, empty, "claude");
    expect(await emptyRun.exited).toBe(0);
    expect(receipt(emptyLog).invocation).toMatch(uuid);
    expect(ids).not.toContain(receipt(emptyLog).invocation);

    const worker = s.role("worker", {
      "APPEND_SYSTEM_PROMPT.md": "Worker instructions",
    });
    const log = join(s.home, "nested.json");
    const child = launch(
      {
        ...s.env,
        FAKE_SESSION_LOG: log,
        FAKE_SESSION_CLI: cli,
        FAKE_SESSION_NESTED_ROLE: worker,
      },
      empty,
      "claude",
    );
    expect(await child.exited).toBe(0);
    const result = receipt(log);
    expect(result.nested.invocation).toMatch(uuid);
    expect(result.nested.invocation).not.toBe(result.invocation);
    expect(result.nested.harness).toBe("opencode");
    expect(result.nested.role).toBe(worker);
    expect(result.nested.args).toEqual(["acp"]);
  } finally {
    s.cleanup();
  }
});

test("OpenCode ACP receives a native role without an added flag, while server and utility restrictions remain", async () => {
  const s = sessionSandbox();
  try {
    const worker = s.role("worker", {
      "APPEND_SYSTEM_PROMPT.md": "Worker instructions",
      "skills/one/SKILL.md": SKILL,
      "mcp.json": '{"mcpServers":{"bridge":{"command":"bridge","args":["mcp"]}}}',
    });
    const log = join(s.home, "acp.json");
    const child = launch({ ...s.env, FAKE_SESSION_LOG: log }, worker, "opencode", "acp");
    expect(await child.exited).toBe(0);
    const result = receipt(log);
    expect(result.args).toEqual(["acp"]);
    expect(result.config.skills).toEqual([join(worker, "skills")]);
    expect(result.config.commands.one.description).toBe("A test skill.");
    expect(result.config.mcp.servers.bridge.command).toEqual(["bridge", "mcp"]);
    expect(result.config.plugins).toHaveLength(1);
    expect(existsSync(result.configPath)).toBe(false);
    const diagnostic = launch(
      { ...s.env, FAKE_SESSION_LOG: log },
      worker,
      "opencode",
      "--print-logs",
      "acp",
    );
    expect(await diagnostic.exited).toBe(0);
    expect(receipt(log).args).toEqual(["--print-logs", "acp"]);
    for (const args of [
      ["acp", "--server=http://localhost:4096"],
      ["attach"],
      ["--print-logs", "attach"],
      ["--print-logs", "api", "get", "/api/info"],
    ]) {
      const denied = launch({ ...s.env, FAKE_SESSION_LOG: log }, worker, "opencode", ...args);
      expect(await denied.exited).toBe(1);
      expect(await new Response(denied.stderr).text()).toContain("agentroles:");
      expect(receipt(log).args).toEqual(["--print-logs", "acp"]);
    }
  } finally {
    s.cleanup();
  }
});
