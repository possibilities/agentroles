import type { Role } from "../role.ts";

/** AgentVoice reads the directory itself; only it can register skill roots on its child. */
export function agentvoiceArguments(role: Role, native: string[]): string[] {
  return ["--role", role.dir, ...native];
}
