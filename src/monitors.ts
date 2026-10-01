import { RoleError } from "./errors.ts";

/** Claude's native experimental.monitors entries, not an AgentRoles overlay. */
export interface Monitor {
  name: string;
  command: string;
  description: string;
  when?: "always" | `on-skill-invoke:${string}`;
}

export function parseMonitors(text: string, source: string): Monitor[] {
  let entries: unknown;
  try {
    entries = JSON.parse(text);
  } catch (error) {
    throw new RoleError(`${source}: not valid JSON: ${String(error)}`);
  }
  if (!Array.isArray(entries)) throw new RoleError(`${source}: expected a monitors array`);
  const names = new Set<string>();
  return entries.map((entry: unknown, index) => {
    const label = `${source}: monitors[${index}]`;
    if (typeof entry !== "object" || entry === null || Array.isArray(entry))
      throw new RoleError(`${label} must be an object`);
    const fields = entry as Record<string, unknown>;
    for (const key of Object.keys(fields)) {
      if (!["name", "command", "description", "when"].includes(key))
        throw new RoleError(`${label}: unknown field "${key}"`);
    }
    for (const key of ["name", "command", "description"]) {
      if (typeof fields[key] !== "string") throw new RoleError(`${label}.${key} must be a string`);
    }
    const monitor = fields as unknown as Monitor;
    if (
      monitor.when !== undefined &&
      monitor.when !== "always" &&
      (typeof monitor.when !== "string" || !/^on-skill-invoke:.+$/.test(monitor.when))
    )
      throw new RoleError(`${label}.when must be "always" or "on-skill-invoke:<skill>"`);
    if (/\$\{user_config\./.test(monitor.command))
      throw new RoleError(`${label}.command cannot reference \${user_config.*}`);
    if (names.has(monitor.name))
      throw new RoleError(`${label}: duplicate monitor name "${monitor.name}"`);
    names.add(monitor.name);
    return monitor;
  });
}
