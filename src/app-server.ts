/**
 * The smallest client for `codex app-server` over stdio: newline-delimited
 * JSON-RPC, one request at a time. Used only to persist a plugin as disabled
 * through Codex's own config editor, never for turns or history.
 */
import type { FileSink, Subprocess } from "bun";
import { RoleError } from "./errors.ts";
import type { Environ } from "./paths.ts";

interface Response {
  id?: number;
  result?: unknown;
  error?: { code?: number; message?: string };
}

export class AppServerClient {
  private readonly child: Subprocess<"pipe", "pipe", "ignore">;
  private readonly stdin: FileSink;
  private readonly lines: AsyncIterator<string>;
  private nextId = 1;

  constructor(codexBinary: string, env: Environ) {
    this.child = Bun.spawn([codexBinary, "app-server", "--listen", "stdio://"], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "ignore",
      env: env as Record<string, string>,
    });
    this.stdin = this.child.stdin;
    this.lines = readLines(this.child.stdout)[Symbol.asyncIterator]();
  }

  async initialize(): Promise<void> {
    await this.request("initialize", {
      clientInfo: { name: "agentroles", title: "agentroles", version: "0.1.0" },
      capabilities: { experimentalApi: true, requestAttestation: false },
    });
    this.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "initialized", params: {} })}\n`);
    await this.stdin.flush();
  }

  async request(method: string, params: unknown): Promise<unknown> {
    const id = this.nextId++;
    this.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    await this.stdin.flush();
    for (;;) {
      const next = await this.lines.next();
      if (next.done) throw new RoleError(`codex app-server closed before answering ${method}`);
      let message: Response;
      try {
        message = JSON.parse(next.value) as Response;
      } catch {
        continue;
      }
      if (message.id !== id) continue;
      if (message.error)
        throw new RoleError(
          `codex app-server ${method} failed: ${message.error.message ?? "unknown error"}`,
        );
      return message.result;
    }
  }

  async close(): Promise<void> {
    try {
      this.stdin.end();
    } catch {
      // Already closed.
    }
    this.child.kill();
    await this.child.exited;
  }
}

async function* readLines(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of stream) {
    buffer += decoder.decode(chunk, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      yield buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
    }
  }
  if (buffer.length > 0) yield buffer;
}
