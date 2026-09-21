import type { Role } from "../role.ts";

/** Fx flags go before the user's tokens; subcommands and the prompt stay last. */
export function fxArguments(role: Role, native: string[]): string[] {
  const args: string[] = [];
  if (role.systemPrompt !== undefined) args.push("--system-prompt-file", role.systemPrompt);
  if (role.appendSystemPrompt !== undefined)
    args.push("--append-system-prompt-file", role.appendSystemPrompt);
  if (role.mcpPath !== undefined) args.push("--mcp-config", role.mcpPath);
  if (role.skillsRoot !== undefined) {
    args.push("--skills-dir", role.skillsRoot);
    args.push("--no-default-skills");
  }
  return [...args, ...native];
}
