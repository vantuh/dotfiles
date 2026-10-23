#!/usr/bin/env bun
/**
 * pipocket — Pi Pocket in the background, like piweb.
 *
 *   pipocket [up]    start the launcher detached, publish it to the tailnet,
 *                    print the address
 *   pipocket status  report the server and the published address
 *   pipocket link    print the owner sign-in link (the owner's key: keep it private)
 *   pipocket down    stop the launcher, which stops the server
 *
 * It runs what `npm run dev` runs. Without a terminal the launcher shows no
 * menu: it reuses the last access choice and writes its panel, sign-in link
 * included, to the log; that is why the log is 0600. `tailscale serve` adds
 * HTTPS on the tailnet, which push and dictation need on a phone.
 */
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import {
  answers,
  listenersOn,
  run,
  spawnDetached,
  waitFor,
  which,
} from '../share/pi-cli/proc.ts';
import { publish } from '../share/pi-cli/tailnet.ts';

const HOME = homedir();
const REPO =
  process.env.PI_POCKET_REPO ??
  join(HOME, 'projects', 'opensource-test', 'pi-pocket');
const LAUNCHER = join(REPO, 'bin', 'pi-pocket.js');
const STATE_DIR = join(HOME, '.local', 'state', 'pi-pocket');
const LOG_FILE = join(STATE_DIR, 'launcher.log');
const PID_FILE = join(STATE_DIR, 'launcher.pid');
const PORT = Number(process.env.PI_POCKET_PORT ?? 8787);
const HTTPS_PORT = Number(process.env.PI_POCKET_HTTPS_PORT ?? 443);
const ADDRESS = `http://127.0.0.1:${PORT}/`;

function isLauncher(pid: number): boolean {
  return run(['ps', '-o', 'command=', '-p', String(pid)]).out.includes(
    'bin/pi-pocket.js',
  );
}

/**
 * The launcher's pid: from the pid file, else the parent of whoever holds the
 * port, so a launcher started by hand (`npm start`) is found too.
 */
function launcherPid(): number | null {
  if (existsSync(PID_FILE)) {
    const pid = Number.parseInt(readFileSync(PID_FILE, 'utf8'), 10);
    if (Number.isInteger(pid) && isLauncher(pid)) return pid;
  }
  for (const pid of listenersOn(PORT)) {
    const parent = Number.parseInt(
      run(['ps', '-o', 'ppid=', '-p', String(pid)]).out,
      10,
    );
    if (Number.isInteger(parent) && isLauncher(parent)) return parent;
  }
  return null;
}

async function status(): Promise<number> {
  const running = await answers(ADDRESS);
  const pid = launcherPid();
  console.log(
    `pipocket: server ${running ? 'running' : 'stopped'} on 127.0.0.1:${PORT}` +
      (pid ? ` (launcher pid ${pid})` : ''),
  );
  if (!running) {
    console.log('pipocket: run `pipocket up` to start it');
    return 1;
  }
  const url = publish(PORT, HTTPS_PORT);
  console.log(
    url ? `pipocket: ${url}` : 'pipocket: not published (is Tailscale up?)',
  );
  console.log('pipocket: `pipocket link` prints the owner sign-in link');
  return 0;
}

function link(): number {
  const log = existsSync(LOG_FILE) ? readFileSync(LOG_FILE, 'utf8') : '';
  const path = [...log.matchAll(/\/login\?token=[\w-]+/g)].pop()?.[0];
  if (!path) {
    console.error(`pipocket: no sign-in link in ${LOG_FILE} yet`);
    return 1;
  }
  const url = publish(PORT, HTTPS_PORT) ?? `http://127.0.0.1:${PORT}`;
  console.log(`${url}${path}`);
  return 0;
}

async function up(): Promise<number> {
  if (await answers(ADDRESS)) {
    console.log(`pipocket: already answering on 127.0.0.1:${PORT}`);
    return status();
  }
  const node = which('node');
  if (!node || !existsSync(LAUNCHER)) {
    console.error(`pipocket: needs node on PATH and ${LAUNCHER}`);
    return 1;
  }
  // The log carries the owner's sign-in token: create it private. A fresh log
  // per start keeps `link` on this run's token.
  writeFileSync(LOG_FILE, '', { mode: 0o600 });
  chmodSync(LOG_FILE, 0o600);
  const pid = spawnDetached({
    command: [node, LAUNCHER, '--cwd', REPO],
    cwd: REPO,
    env: process.env,
    logFile: LOG_FILE,
  });
  writeFileSync(PID_FILE, `${pid}\n`);
  console.log(`pipocket: starting (launcher pid ${pid})`);
  if (!(await waitFor(() => answers(ADDRESS), 60_000))) {
    console.error(`pipocket: did not come up; last lines of ${LOG_FILE}:`);
    const tail = run(['tail', '-n', '15', LOG_FILE]);
    if (tail.out) console.error(tail.out.replace(/token=[\w-]+/g, 'token=…'));
    return 1;
  }
  return status();
}

async function down(): Promise<number> {
  const pid = launcherPid();
  rmSync(PID_FILE, { force: true });
  // SIGTERM lets the launcher stop the server itself (10 s grace, then SIGKILL).
  const targets = pid ? [pid] : listenersOn(PORT);
  if (targets.length === 0) {
    console.log('pipocket: not running');
    return 0;
  }
  for (const target of targets) {
    try {
      process.kill(target, 'SIGTERM');
    } catch {}
  }
  const stopped = await waitFor(
    async () => listenersOn(PORT).length === 0,
    15_000,
  );
  console.log(
    stopped
      ? `pipocket: stopped (pid ${targets.join(', ')})`
      : `pipocket: port ${PORT} is still held; check \`lsof -iTCP:${PORT}\``,
  );
  return stopped ? 0 : 1;
}

mkdirSync(STATE_DIR, { recursive: true });

switch (process.argv[2] ?? 'up') {
  case 'up':
    process.exit(await up());
  case 'status':
    process.exit(await status());
  case 'link':
    process.exit(link());
  case 'down':
    process.exit(await down());
  default:
    console.error('usage: pipocket [up|down|status|link]');
    process.exit(2);
}
