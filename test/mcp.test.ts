import { describe, expect, test } from "bun:test";
import { RoleError } from "../src/errors.ts";
import { parseMcpServers, toCodexMcpServers, toOpencodeMcpServers } from "../src/mcp.ts";

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

  test("translates Claude-shaped servers into OpenCode local/remote entries", () => {
    const servers = parseMcpServers(
      JSON.stringify({
        mcpServers: {
          papers: {
            type: "stdio",
            command: "uvx",
            args: ["papers-mcp"],
            env: { A: "1" },
            cwd: "/tmp",
            disabled: true,
            timeout: 8000,
          },
          docs: { type: "http", url: "https://example.test/mcp", headers: { "X-Key": "k" } },
          events: { type: "sse", url: "https://example.test/sse" },
        },
      }),
      "mcp.json",
    );
    expect(toOpencodeMcpServers(servers, "mcp.json")).toEqual({
      papers: {
        type: "local",
        command: ["uvx", "papers-mcp"],
        environment: { A: "1" },
        cwd: "/tmp",
        enabled: false,
        timeout: 8000,
      },
      docs: {
        type: "remote",
        url: "https://example.test/mcp",
        headers: { "X-Key": "k" },
      },
      events: { type: "remote", url: "https://example.test/sse" },
    });
    expect(() => toOpencodeMcpServers({ x: { type: "websocket", url: "u" } }, "mcp.json")).toThrow(
      "not supported by OpenCode",
    );
    expect(() => toOpencodeMcpServers({ x: { command: "c", args: "nope" } }, "mcp.json")).toThrow(
      "args must be an array of strings",
    );
  });
});
