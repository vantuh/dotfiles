#!/usr/bin/env bun
/**
 * pi-web-mic — pi-web with a microphone button in its composer.
 *
 *   pi-web-mic [up]      start the shim (pi-web and the dictation daemon should be running)
 *   pi-web-mic status    report the shim, pi-web and the dictation daemon
 *   pi-web-mic down      stop the shim
 *
 * The shim is a local reverse proxy: it leaves pi-web's code alone and injects
 * one script that draws the button and inserts the transcript. `piweb` starts it
 * together with pi-web and publishes it to the tailnet, so on a phone the
 * address is the usual one and the button is simply there.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import {
  answers,
  listenersOn,
  run,
  spawnDetached,
  waitFor,
  which,
} from '../share/pi-cli/proc.ts';

const HOME = homedir();
const APP_DIR = join(HOME, '.local', 'share', 'pi-web-mic');
const ENTRY = join(APP_DIR, 'proxy.ts');
const STATE_DIR = join(HOME, '.local', 'state', 'pi-web-mic');
const PID_FILE = join(STATE_DIR, 'server.pid');
const LOG_FILE = join(STATE_DIR, 'server.log');
const PORT = Number(process.env.PI_WEB_MIC_PORT ?? 8788);
const UPSTREAM = process.env.PI_WEB_MIC_UPSTREAM ?? 'http://127.0.0.1:30141';
const DICTATION = process.env.PI_WEB_MIC_DICTATION ?? 'http://127.0.0.1:8791';
const ADDRESS = `http://127.0.0.1:${PORT}/`;

async function report(): Promise<number> {
  const shim = await answers(ADDRESS);
  const web = await answers(UPSTREAM);
  const dictation = await answers(`${DICTATION}/health`);
  console.log(
    `pi-web-mic: shim ${shim ? 'running' : 'stopped'} on 127.0.0.1:${PORT}`,
  );
  console.log(
    `pi-web-mic: pi-web ${web ? 'running' : 'stopped'} (${UPSTREAM})`,
  );
  console.log(
    `pi-web-mic: dictation ${dictation ? 'ready' : 'stopped'} (${DICTATION})`,
  );
  if (shim) {
    console.log(
      `pi-web-mic: open ${ADDRESS}, or publish it: tailnet-serve-url ${PORT} 8443`,
    );
  }
  return shim ? 0 : 1;
}

async function up(): Promise<number> {
  if (await answers(ADDRESS)) return report();

  if (!existsSync(ENTRY)) {
    console.error(`pi-web-mic: missing ${ENTRY} (run chezmoi apply)`);
    return 1;
  }
  const bun = which('bun');
  if (!bun) {
    console.error('pi-web-mic: bun must be on PATH');
    return 1;
  }

  mkdirSync(dirname(PID_FILE), { recursive: true });
  const pid = spawnDetached({
    command: [bun, 'run', ENTRY],
    cwd: APP_DIR,
    env: process.env,
    logFile: LOG_FILE,
  });
  writeFileSync(PID_FILE, `${pid}\n`);
  if (!(await waitFor(() => answers(ADDRESS), 20_000))) {
    console.error(
      `pi-web-mic: the shim did not start; last lines of ${LOG_FILE}:`,
    );
    const tail = run(['tail', '-n', '10', LOG_FILE]);
    if (tail.out) console.error(tail.out);
    return 1;
  }
  console.log(`pi-web-mic: started (pid ${pid})`);
  return report();
}

function down(): number {
  // Whoever holds the port is the shim; a pid from a stale file may be someone else.
  const pids = listenersOn(PORT);
  rmSync(PID_FILE, { force: true });
  if (pids.length === 0) {
    console.log('pi-web-mic: not running');
    return 0;
  }
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {}
  }
  console.log(`pi-web-mic: stopped (pids: ${pids.join(', ')})`);
  return 0;
}

switch (process.argv[2] ?? 'up') {
  case 'up':
    process.exit(await up());
  case 'status':
    process.exit(await report());
  case 'down':
    process.exit(down());
  default:
    console.error('usage: pi-web-mic [up|down|status]');
    process.exit(2);
}
