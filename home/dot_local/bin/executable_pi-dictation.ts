#!/usr/bin/env bun
/**
 * pi-dictation — start, stop and address the local dictation server.
 *
 * The server itself lives in ~/.local/share/pi-dictation (see its README notes
 * in src/server.ts); this only owns the process: it starts the daemon detached
 * with the model loading in the background, keeps its pid and log under
 * ~/.local/state/pi-dictation, and publishes the port to the tailnet so a phone
 * can open it over HTTPS (required for the microphone and for installing the
 * page on the home screen).
 *
 *   pi-dictation up      start if needed and print the phone address
 *   pi-dictation status  one line of state, plus the address once it is ready
 *   pi-dictation down    stop the daemon
 *   pi-dictation log     follow the daemon log
 *
 * Commands match piweb (up/down); `start` and `stop` still work.
 */
import {
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PORT = Number(process.env.PI_DICTATION_PORT ?? 8791);
const HTTPS_PORT = Number(process.env.PI_DICTATION_HTTPS_PORT ?? 9443);
const HOME = homedir();
const APP_DIR = join(HOME, '.local', 'share', 'pi-dictation');
const ENTRY = join(APP_DIR, 'src', 'server.ts');
const STATE_DIR = join(HOME, '.local', 'state', 'pi-dictation');
const PID_FILE = join(STATE_DIR, 'server.pid');
const LOG_FILE = join(STATE_DIR, 'server.log');
const HEALTH = `http://127.0.0.1:${PORT}/health`;

interface Health {
  ready?: boolean;
  warming?: boolean;
  error?: string | null;
  model?: string;
}

async function health(timeoutMs = 1500): Promise<Health | null> {
  try {
    const response = await fetch(HEALTH, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    return response.ok ? ((await response.json()) as Health) : null;
  } catch {
    return null;
  }
}

function run(command: string[]): { ok: boolean; out: string } {
  const result = Bun.spawnSync({
    cmd: command,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return {
    ok: result.exitCode === 0,
    out: `${result.stdout.toString()}${result.stderr.toString()}`.trim(),
  };
}

/** This machine's MagicDNS name; the HTTPS certificate is issued for that name. */
function tailnetHost(): string | null {
  const status = run(['tailscale', 'status', '--json']);
  if (!status.ok) return null;
  try {
    const name = (JSON.parse(status.out) as { Self?: { DNSName?: string } })
      .Self?.DNSName;
    return name ? name.replace(/\.$/, '') : null;
  } catch {
    return null;
  }
}

/** Publish the loopback port to the tailnet, once. `tailscale serve` keeps its config. */
function publish(): string | null {
  const host = tailnetHost();
  if (!host) return null;
  const status = run(['tailscale', 'serve', 'status']);
  if (!status.out.includes(`http://127.0.0.1:${PORT}`)) {
    const result = run([
      'tailscale',
      'serve',
      '--bg',
      `--https=${HTTPS_PORT}`,
      `http://127.0.0.1:${PORT}`,
    ]);
    if (!result.ok) return null;
  }
  return `https://${host}:${HTTPS_PORT}`;
}

function installed(): boolean {
  return existsSync(join(APP_DIR, 'node_modules', 'transcribe-cpp'));
}

function start(): Promise<number> {
  if (!existsSync(ENTRY)) {
    console.error(`pi-dictation: missing ${ENTRY} (run chezmoi apply)`);
    return 1;
  }
  if (!installed()) {
    console.log('pi-dictation: installing dependencies (bun install)…');
    const result = Bun.spawnSync({
      cmd: ['bun', 'install'],
      cwd: APP_DIR,
      stdout: 'inherit',
      stderr: 'inherit',
    });
    if (result.exitCode !== 0) {
      console.error('pi-dictation: bun install failed');
      return 1;
    }
  }

  mkdirSync(STATE_DIR, { recursive: true });
  const log = openSync(LOG_FILE, 'a');
  const child = Bun.spawn({
    cmd: ['bun', 'run', ENTRY],
    cwd: APP_DIR,
    detached: true,
    stdio: ['ignore', log, log],
    env: { ...process.env, PI_DICTATION_PORT: String(PORT) },
  });
  child.unref();
  writeFileSync(PID_FILE, `${child.pid}\n`);

  return report(Number(child.pid));
}

/** Walks from "starting" to "ready", because the model takes ~16 s to load. */
async function report(pid: number): Promise<number> {
  const deadline = Date.now() + 90_000;
  let last = '';
  while (Date.now() < deadline) {
    const state = await health();
    if (state?.ready) {
      const url = publish();
      console.log(`pi-dictation: ready (pid ${pid}, ${state.model})`);
      console.log(
        url
          ? `pi-dictation: ${url}`
          : `pi-dictation: local only — http://127.0.0.1:${PORT} (is Tailscale up?)`,
      );
      return 0;
    }
    if (state?.error) {
      console.error(`pi-dictation: model failed to load: ${state.error}`);
      return 1;
    }
    const now = state?.warming
      ? 'loading the model…'
      : 'waiting for the server…';
    if (now !== last) {
      console.log(`pi-dictation: ${now}`);
      last = now;
    }
    await Bun.sleep(1000);
  }
  console.error(`pi-dictation: gave up waiting; see ${LOG_FILE}`);
  return 1;
}

async function status(): Promise<number> {
  const state = await health();
  if (!state) {
    console.log('pi-dictation: not running');
    return 1;
  }
  console.log(
    `pi-dictation: ${state.ready ? 'ready' : state.warming ? 'warming up' : 'unhealthy'} (${state.model ?? '?'})`,
  );
  const url = publish();
  if (url) console.log(`pi-dictation: ${url}`);
  return state.ready ? 0 : 1;
}

function stop(): number {
  let pid = Number.parseInt(
    existsSync(PID_FILE) ? readFileSync(PID_FILE, 'utf8').trim() : '',
    10,
  );
  if (!Number.isInteger(pid) || pid <= 0) {
    // No pid file (or a stale one): fall back to whoever holds the port.
    const listeners = run([
      'lsof',
      '-nP',
      `-iTCP:${PORT}`,
      '-sTCP:LISTEN',
      '-t',
    ]);
    pid = Number.parseInt(listeners.out.split('\n')[0] ?? '', 10);
  }
  if (!Number.isInteger(pid) || pid <= 0) {
    console.log('pi-dictation: not running');
    return 0;
  }
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    console.log('pi-dictation: it was already gone');
  }
  rmSync(PID_FILE, { force: true });
  console.log(`pi-dictation: stopped (pid ${pid})`);
  return 0;
}

const command = process.argv[2] ?? 'up';
switch (command) {
  case 'up':
  case 'start': {
    // A server that is already answering only needs its address printing;
    // anything else is a fresh start, which waits for the model to load.
    const state = await health();
    if (state?.ready) process.exit(await status());
    process.exit(await start());
  }
  case 'status':
    process.exit(await status());
  case 'down':
  case 'stop':
    process.exit(stop());
  case 'log':
    process.exit(
      Bun.spawnSync({
        cmd: ['tail', '-f', LOG_FILE],
        stdout: 'inherit',
        stderr: 'inherit',
      }).exitCode ?? 0,
    );
  default:
    console.error('usage: pi-dictation [up|down|status|log]');
    process.exit(2);
}
