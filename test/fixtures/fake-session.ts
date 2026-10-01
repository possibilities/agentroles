import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Inspect public delivery and spawn sample children to check inheritance, not
// Claude's Monitor lifecycle or OpenCode's native server implementation.
if (process.argv[2] === "--version") {
  console.log("opencode v2.0.16");
  process.exit(0);
}

const args = process.argv.slice(2);
const pluginIndex = args.indexOf("--plugin-dir");
const plugin = pluginIndex === -1 ? undefined : args[pluginIndex + 1];
const snapshot: Record<string, unknown> = {
  args,
  invocation: process.env["AGENTROLES_INVOCATION_ID"],
  harness: process.env["AGENTROLES_HARNESS"],
  role: process.env["AGENTROLES_ROLE"],
  name: process.env["AGENTROLES_NAME"],
  plugin,
};

function child(command: string[]): unknown {
  const result = Bun.spawnSync(command, { env: process.env, stdin: "ignore" });
  if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
  return JSON.parse(new TextDecoder().decode(result.stdout));
}

if (plugin !== undefined) {
  const manifest = JSON.parse(readFileSync(join(plugin, ".claude-plugin", "plugin.json"), "utf8"));
  snapshot["manifest"] = manifest;
  snapshot["monitors"] = (manifest.experimental?.monitors ?? []).map(
    (monitor: { command: string }) => child(["/bin/sh", "-c", monitor.command]),
  );
  snapshot["skill"] = existsSync(join(plugin, "skills", "one", "SKILL.md"));
}
const mcpIndex = args.indexOf("--mcp-config");
if (mcpIndex !== -1) {
  const servers = JSON.parse(readFileSync(args[mcpIndex + 1]!, "utf8")).mcpServers;
  snapshot["mcp"] = Object.values(servers).map((server) => {
    const local = server as { command: string; args?: string[] };
    return child([local.command, ...(local.args ?? [])]);
  });
}
const config = process.env["OPENCODE_CONFIG"];
if (config !== undefined) {
  snapshot["configPath"] = config;
  snapshot["config"] = JSON.parse(readFileSync(config, "utf8"));
}

const log = process.env["FAKE_SESSION_LOG"]!;
const nestedRole = process.env["FAKE_SESSION_NESTED_ROLE"];
if (nestedRole !== undefined) {
  const nestedLog = `${log}.nested`;
  const result = Bun.spawnSync(
    [process.execPath, process.env["FAKE_SESSION_CLI"]!, nestedRole, "--", "opencode", "acp"],
    {
      env: {
        ...process.env,
        FAKE_SESSION_NESTED_ROLE: undefined,
        FAKE_SESSION_LOG: nestedLog,
      },
      stdin: "ignore",
    },
  );
  if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
  snapshot["nested"] = JSON.parse(readFileSync(nestedLog, "utf8"));
}
writeFileSync(log, JSON.stringify(snapshot));

const release = process.env["FAKE_SESSION_RELEASE"];
if (release !== undefined) {
  const deadline = Date.now() + 10_000;
  while (!existsSync(release)) {
    if (Date.now() > deadline) throw new Error("fake session release timed out");
    await Bun.sleep(10);
  }
  if (plugin !== undefined) {
    snapshot["pluginIntact"] =
      JSON.stringify(
        JSON.parse(readFileSync(join(plugin, ".claude-plugin", "plugin.json"), "utf8")),
      ) === JSON.stringify(snapshot["manifest"]);
    writeFileSync(log, JSON.stringify(snapshot));
  }
}
