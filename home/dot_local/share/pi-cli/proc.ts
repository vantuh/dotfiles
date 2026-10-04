/**
 * Process and environment helpers shared by the local service CLIs (piweb,
 * hwui, pi-dictation).
 *
 * They all start a detached server, find out whether it answers, and stop it by
 * whoever holds the port, so that logic lives here once instead of in each CLI.
 */
import { closeSync, existsSync, mkdirSync, openSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';

const HOME = homedir();

/** Synchronous command runner: these CLIs only ever shell out for a quick answer. */
export function run(
  command: string[],
  options: { cwd?: string } = {},
): { ok: boolean; out: string } {
  const result = Bun.spawnSync({
    cmd: command,
    ...(options.cwd ? { cwd: options.cwd } : {}),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return {
    ok: result.exitCode === 0,
    out: `${result.stdout.toString()}${result.stderr.toString()}`.trim(),
  };
}

/** Absolute path of a command, or null. `Bun.which` already honours PATH. */
export function which(name: string): string | null {
  return Bun.which(name);
}

/**
 * PATH for a server we spawn. A CLI can be invoked from an environment that has
 * no login shell behind it — a LaunchAgent, a GUI app, another tool — and
 * launchd's PATH has neither node nor bun. The servers hand their PATH down to
 * the sessions and subagents they start, so this is what keeps them working.
 *
 * Existing entries come first (a shell's choices win), the known tool
 * directories are appended so something is always found.
 */
export function sanePath(): string {
  const known = [
    join(HOME, '.local', 'bin'),
    join(HOME, '.bun', 'bin'),
    join(HOME, '.nvm', 'current', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin',
  ].filter((dir) => existsSync(dir));
  const current = (process.env.PATH ?? '').split(delimiter).filter(Boolean);
  return [...new Set([...current, ...known])].join(delimiter);
}

/** Pids listening on a TCP port, usually zero or one of them. */
export function listenersOn(port: number): number[] {
  const result = run(['lsof', '-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t']);
  return result.out
    .split('\n')
    .map((line) => Number.parseInt(line.trim(), 10))
    .filter((pid) => Number.isInteger(pid) && pid > 0);
}

/** True when something answers on the URL, whatever its status code. */
export async function answers(url: string, timeoutMs = 3000): Promise<boolean> {
  try {
    await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'manual',
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Starts a server detached from this CLI, so it outlives the shell that asked
 * for it, with its output appended to `logFile`.
 */
export function spawnDetached(options: {
  command: string[];
  cwd: string;
  env: Record<string, string | undefined>;
  logFile: string;
}): number {
  mkdirSync(dirname(options.logFile), { recursive: true });
  const log = openSync(options.logFile, 'a');
  const child = Bun.spawn({
    cmd: options.command,
    cwd: options.cwd,
    detached: true,
    stdio: ['ignore', log, log],
    env: { ...options.env, PATH: sanePath() },
  });
  child.unref();
  closeSync(log);
  return child.pid;
}

/** Waits for `check` to answer, polling like a person would watch for it. */
export async function waitFor(
  check: () => Promise<boolean>,
  timeoutMs: number,
  intervalMs = 500,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return true;
    await Bun.sleep(intervalMs);
  }
  return check();
}
