import type { Role } from "../role.ts";

/** Claude flags go before the user's tokens; the prompt is positional and last. */
export function claudeArguments(role: Role, pluginDir: string | null, native: string[]): string[] {
  const args: string[] = [];
  if (role.systemPrompt !== undefined) args.push("--system-prompt-file", role.systemPrompt);
  if (role.appendSystemPrompt !== undefined)
    args.push("--append-system-prompt-file", role.appendSystemPrompt);
  if (role.mcpPath !== undefined) args.push("--mcp-config", role.mcpPath);
  if (pluginDir !== null) args.push("--plugin-dir", pluginDir);
  return [...args, ...native];
}
