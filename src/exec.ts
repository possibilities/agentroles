import { RoleError } from "./errors.ts";
import type { Environ } from "./paths.ts";
import type { Role } from "./role.ts";

const SIGNAL_EXIT: Record<string, number> = {
  SIGHUP: 129,
  SIGINT: 130,
  SIGQUIT: 131,
  SIGTERM: 143,
};

export function resolveBinary(name: string, env: Environ): string {
  const path = env["PATH"];
  const resolved = path === undefined ? Bun.which(name) : Bun.which(name, { PATH: path });
  if (resolved === null)
    throw new RoleError(`${name} is not on PATH`, `install ${name} or adjust PATH`);
  return resolved;
}

/**
 * Runs the harness through PATH so AgentLaunch's shim still applies its fleet
 * policy. The role is also named in the environment for skills that need it.
 */
export async function runHarness(
  role: Role,
  command: string[],
  env: Environ = process.env,
): Promise<number> {
  const [bin, ...rest] = command;
  if (bin === undefined) throw new RoleError("no harness command given after --");
  const child = Bun.spawn([resolveBinary(bin, env), ...rest], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
    env: { ...env, AGENTROLES_ROLE: role.dir, AGENTROLES_NAME: role.name } as Record<
      string,
      string
    >,
  });
  const forward = (signal: "SIGTERM" | "SIGHUP") => (): void => {
    try {
      child.kill(signal);
    } catch {
      // Already exited.
    }
  };
  const onInterrupt = (): void => {};
  const onTerminate = forward("SIGTERM");
  const onHangup = forward("SIGHUP");
  process.on("SIGINT", onInterrupt);
  process.on("SIGTERM", onTerminate);
  process.on("SIGHUP", onHangup);
  try {
    const code = await child.exited;
    if (child.signalCode !== null) return SIGNAL_EXIT[child.signalCode] ?? 1;
    return code;
  } finally {
    process.off("SIGINT", onInterrupt);
    process.off("SIGTERM", onTerminate);
    process.off("SIGHUP", onHangup);
  }
}
