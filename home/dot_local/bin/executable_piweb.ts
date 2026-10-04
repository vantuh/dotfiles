#!/usr/bin/env bun
/**
 * piweb — this machine's phone experience in one command.
 *
 *   piweb [up]      start the dictation daemon, pi-web and the mic shim, publish
 *                   the address a phone opens, print it
 *   piweb status    report all three; the publish step is idempotent, so the
 *                   address it prints is one that works
 *   piweb down      stop the shim, pi-web and the dictation daemon
 *
 * The published address is the mic shim — pi-web itself plus a microphone button
 * in the composer that records on the phone and transcribes here. pi-web's own
 * code is untouched; see ~/.local/share/pi-web-mic.
 *
 * Configuration lives in ~/.config/pi-web/env (mode 0600): PORT, PI_WEB_PASSWORD,
 * PI_WEB_ALLOWED_HOSTS and PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT, which is
 * what lets subagents spawn child Pi processes under pi-web. The file is passed
 * to the spawned server and to nothing else — this CLI never prints the password
 * and never puts it in its own environment.
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
import { publish } from '../share/pi-cli/tailnet.ts';

const HOME = homedir();
const BIN_DIR = join(HOME, '.local', 'bin');
const ENV_FILE = join(HOME, '.config', 'pi-web', 'env');
const LOG_FILE = join(HOME, '.config', 'pi-web', 'pi-web.log');
const PID_FILE = join(HOME, '.local', 'state', 'pi-web', 'server.pid');
const HTTPS_PORT = Number(process.env.PI_WEB_HTTPS_PORT ?? 8443);
const MIC_PORT = Number(process.env.PI_WEB_MIC_PORT ?? 8788);
const DICTATION_URL =
  process.env.PI_WEB_MIC_DICTATION ?? 'http://127.0.0.1:8791';

/** KEY=VALUE lines, comments and blanks ignored; values are not shell-expanded. */
function readEnvFile(): Record<string, string> {
  const values: Record<string, string> = {};
  if (!existsSync(ENV_FILE)) return values;
  for (const line of readFileSync(ENV_FILE, 'utf8').split('\n')) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (match)
      values[match[1]] = match[2]
        .replace(/^"(.*)"$/, '$1')
        .replace(/^'(.*)'$/, '$1');
  }
  return values;
}

const env = readEnvFile();
const PORT = Number(env.PORT || process.env.PI_WEB_PORT || 30141);
const ADDRESS = `http://127.0.0.1:${PORT}/`;
const MIC_ADDRESS = `http://127.0.0.1:${MIC_PORT}/`;

/** Runs one of the other CLIs of this repository with its output attached. */
function cli(name: string, command: string): boolean {
  const bun = which('bun');
  if (!bun) return false;
  const result = Bun.spawnSync({
    cmd: [bun, join(BIN_DIR, name), command],
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  });
  return result.exitCode === 0;
}

async function status(): Promise<number> {
  const web = await answers(ADDRESS);
  const dictation = await answers(`${DICTATION_URL}/health`);
  const mic = await answers(MIC_ADDRESS);

  console.log(
    `piweb: pi-web ${web ? 'running' : 'stopped'} on 127.0.0.1:${PORT}`,
  );
  console.log(
    `piweb: dictation daemon ${dictation ? 'ready' : 'stopped'} (${DICTATION_URL})`,
  );
  console.log(
    `piweb: mic shim ${mic ? 'running' : 'stopped'} on 127.0.0.1:${MIC_PORT}`,
  );
  if (!mic) {
    console.log('piweb: run `piweb up` to start everything');
    return web ? 0 : 1;
  }
  const url = publish(MIC_PORT, HTTPS_PORT);
  console.log(
    url ? `piweb: ${url}` : `piweb: not published (is Tailscale up?)`,
  );
  console.log(`piweb: password is the PI_WEB_PASSWORD line in ${ENV_FILE}`);
  return 0;
}

async function startWeb(): Promise<boolean> {
  if (await answers(ADDRESS)) {
    console.log(`piweb: pi-web already answering on 127.0.0.1:${PORT}`);
    return true;
  }
  const binary = which('pi-web');
  const node = which('node');
  if (!binary || !node) {
    console.error(
      'piweb: pi-web and node must be on PATH (npm install -g @agegr/pi-web)',
    );
    return false;
  }
  mkdirSync(dirname(PID_FILE), { recursive: true });
  const pid = spawnDetached({
    command: [node, binary],
    cwd: HOME,
    env: { ...process.env, ...env },
    logFile: LOG_FILE,
  });
  writeFileSync(PID_FILE, `${pid}\n`);
  console.log(`piweb: pi-web starting (pid ${pid})`);
  if (!(await waitFor(() => answers(ADDRESS), 60_000))) {
    console.error(`piweb: pi-web did not come up; last lines of ${LOG_FILE}:`);
    const tail = run(['tail', '-n', '10', LOG_FILE]);
    if (tail.out) console.error(tail.out);
    return false;
  }
  console.log('piweb: pi-web started');
  return true;
}

async function up(): Promise<number> {
  // The daemon first: the shim's button is useless without it, and it warms in
  // the background while pi-web starts.
  if (!(await answers(`${DICTATION_URL}/health`))) {
    console.log('piweb: starting the dictation daemon');
    if (!cli('pi-dictation.ts', 'up')) {
      console.error(
        'piweb: the dictation daemon did not start; the mic button will report it',
      );
    }
  }
  if (!(await startWeb())) return 1;
  if (!(await answers(MIC_ADDRESS)) && !cli('pi-web-mic.ts', 'up')) {
    console.error(
      'piweb: the mic shim did not start; pi-web itself still works',
    );
  }
  return status();
}

function down(): number {
  cli('pi-web-mic.ts', 'down');

  // Whoever holds the port is the server; a pid from a stale file may be someone else.
  const pids = listenersOn(PORT);
  rmSync(PID_FILE, { force: true });
  if (pids.length === 0) {
    console.log('piweb: pi-web not running');
  } else {
    for (const pid of pids) {
      try {
        process.kill(pid, 'SIGTERM');
      } catch {}
    }
    console.log(`piweb: pi-web stopped (pids: ${pids.join(', ')})`);
  }

  cli('pi-dictation.ts', 'down');
  return 0;
}

switch (process.argv[2] ?? 'up') {
  case 'up':
  case 'start':
    process.exit(await up());
  case 'status':
    process.exit(await status());
  case 'down':
  case 'stop':
    process.exit(down());
  default:
    console.error('usage: piweb [up|down|status]');
    process.exit(2);
}
