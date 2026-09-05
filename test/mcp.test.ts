import { describe, expect, test } from "bun:test";
import { RoleError } from "../src/errors.ts";
import { parseMcpServers, toCodexMcpServers } from "../src/mcp.ts";

describe("mcp.json", () => {
  test("parses the .mcp.json shape and translates Claude-only keys for Codex", () => {
    const servers = parseMcpServers(
      JSON.stringify({
        mcpServers: {
          papers: { type: "stdio", command: "uvx", args: ["papers-mcp"], env: { A: "1" } },
          docs: { type: "http", url: "https://example.test/mcp", headers: { "X-Key": "k" } },
        },
      }),
      "mcp.json",
    );
    expect(toCodexMcpServers(servers, "mcp.json")).toEqual({
      papers: { command: "uvx", args: ["papers-mcp"], env: { A: "1" } },
      docs: { url: "https://example.test/mcp", http_headers: { "X-Key": "k" } },
    });
    const bad = [
      "{",
      "[]",
      '{"mcpServers": []}',
      '{"mcpServers": {"bad.name": {"command": "x"}}}',
      '{"mcpServers": {"x": "s"}}',
      '{"mcpServers": {"x": {"command": "c", "url": "u"}}}',
      '{"mcpServers": {"x": {}}}',
    ];
    for (const text of bad) expect(() => parseMcpServers(text, "mcp.json")).toThrow(RoleError);
    expect(() => toCodexMcpServers({ x: { type: "sse", url: "u" } }, "mcp.json")).toThrow(
      "not supported by Codex",
    );
    expect(() => toCodexMcpServers({ x: { url: "u", headers: "h" } }, "mcp.json")).toThrow(
      "headers must be an object",
    );
  });
});
