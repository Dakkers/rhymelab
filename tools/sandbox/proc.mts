/**
 * Child-process and network helpers. Child output goes to stderr so that
 * stdout stays clean for `--json`.
 */
import { spawnSync, type SpawnSyncOptions } from "node:child_process";
import { createConnection } from "node:net";

/** Raised for an expected, user-facing failure. `exitCode` is the process exit code. */
export class SandboxError extends Error {
  override name = "SandboxError";
  readonly exitCode: number;
  readonly fix: string | undefined;

  constructor(message: string, { exitCode = 1, fix }: { exitCode?: number; fix?: string } = {}) {
    super(message);
    this.exitCode = exitCode;
    this.fix = fix;
  }
}

/** Write a progress line to stderr. */
export function log(message: string): void {
  process.stderr.write(`${message}\n`);
}

/**
 * Run a command to completion, streaming its output to stderr.
 *
 * @throws {SandboxError} When it exits non-zero.
 */
export function run(cmd: string, args: readonly string[], opts: SpawnSyncOptions = {}): void {
  const result = spawnSync(cmd, args, { stdio: ["ignore", 2, 2], ...opts });
  if (result.error) throw new SandboxError(`${cmd}: ${result.error.message}`);
  if (result.status !== 0) {
    throw new SandboxError(`\`${[cmd, ...args].join(" ")}\` exited with ${result.status}`);
  }
}

/** Run a command and capture its stdout. Never throws; check `ok`. */
export function capture(
  cmd: string,
  args: readonly string[],
  opts: SpawnSyncOptions = {},
): { ok: boolean; stdout: string; stderr: string } {
  const result = spawnSync(cmd, args, { encoding: "utf8", ...opts });
  return {
    ok: !result.error && result.status === 0,
    stdout: String(result.stdout ?? "").trim(),
    stderr: String(result.stderr ?? result.error?.message ?? "").trim(),
  };
}

/** Whether `cmd` resolves on PATH. */
export function onPath(cmd: string): boolean {
  return capture("sh", ["-c", `command -v ${cmd}`]).ok;
}

/** Whether something accepts TCP connections on `port` over IPv4 or IPv6 loopback. */
export async function portBusy(port: number): Promise<boolean> {
  const results = await Promise.all(["127.0.0.1", "::1"].map((host) => canConnect(host, port)));
  return results.some(Boolean);
}

/** The first port at or above `start` that nothing is listening on. */
export async function freePort(start: number): Promise<number> {
  let port = start;
  while (await portBusy(port)) port++;
  return port;
}

/** Whether a process with `pid` exists. */
export function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Resolve after `ms` milliseconds. */
export async function sleep(ms: number): Promise<void> {
  await new Promise((done) => setTimeout(done, ms));
}

async function canConnect(host: string, port: number): Promise<boolean> {
  return await new Promise((done) => {
    const socket = createConnection({ host, port });
    socket.setTimeout(300);
    socket.once("connect", () => {
      socket.destroy();
      done(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      done(false);
    });
    socket.once("error", () => done(false));
  });
}
