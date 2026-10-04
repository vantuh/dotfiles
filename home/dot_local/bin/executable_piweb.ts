#!/usr/bin/env bun
/**
 * piweb — start, stop and address the pi-web server.
 *
 *   piweb [up]      start it when needed, publish it to the tailnet, print the address
 *   piweb status    report only, never start anything
 *   piweb down      stop it
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
const ENV_FILE = join(HOME, '.config', 'pi-web', 'env');
const LOG_FILE = join(HOME, '.config', 'pi-web', 'pi-web.log');
const PID_FILE = join(HOME, '.local', 'state', 'pi-web', 'server.pid');
const HTTPS_PORT = Number(process.env.PI_WEB_HTTPS_PORT ?? 8443);

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

async function status(): Promise<number> {
  if (!(await answers(ADDRESS))) {
    console.log('piweb: not running');
    return 1;
  }
  console.log(`piweb: running on 127.0.0.1:${PORT}`);
  const url = publish(PORT, HTTPS_PORT);
  console.log(
    url ? `piweb: ${url}` : `piweb: not published (is Tailscale up?)`,
  );
  console.log(`piweb: password is the PI_WEB_PASSWORD line in ${ENV_FILE}`);
  return 0;
}

async function up(): Promise<number> {
  if (await answers(ADDRESS)) {
    console.log(`piweb: already answering on 127.0.0.1:${PORT}`);
    return status();
  }

  const binary = which('pi-web');
  const node = which('node');
  if (!binary || !node) {
    console.error(
      'piweb: pi-web and node must be on PATH (npm install -g @agegr/pi-web)',
    );
    return 1;
  }

  mkdirSync(dirname(PID_FILE), { recursive: true });
  const pid = spawnDetached({
    command: [node, binary],
    cwd: HOME,
    env: { ...process.env, ...env },
    logFile: LOG_FILE,
  });
  writeFileSync(PID_FILE, `${pid}\n`);
  console.log(`piweb: starting (pid ${pid})`);

  if (!(await waitFor(() => answers(ADDRESS), 60_000))) {
    console.error(`piweb: did not come up; last lines of ${LOG_FILE}:`);
    const tail = run(['tail', '-n', '10', LOG_FILE]);
    if (tail.out) console.error(tail.out);
    return 1;
  }
  console.log(`piweb: started (log: ${LOG_FILE})`);
  return status();
}

function down(): number {
  // The pid file is only a hint: whoever holds the port is the server, and a pid
  // from a stale file may already belong to something else.
  const pids = listenersOn(PORT);
  rmSync(PID_FILE, { force: true });
  if (pids.length === 0) {
    console.log('piweb: not running');
    return 0;
  }
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {}
  }
  console.log(`piweb: stopped (pids: ${pids.join(', ')})`);
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
