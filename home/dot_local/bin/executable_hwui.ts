#!/usr/bin/env bun
/**
 * hwui — the herdr web ui bridge (devswha/herdr-web-ui).
 *
 *   hwui [up]      start the bridge, publish it to the tailnet, print the QR code
 *   hwui status    report only
 *   hwui down      stop the bridge
 *   hwui phone     publish and print the QR code without starting anything
 *
 * Herdr cannot start this plugin by itself: its plugin commands inherit a PATH
 * that has no bun, so the bridge is started from a shell — which is what this is.
 * Everything else (port choice, pairing, updates, the QR code) belongs to the
 * plugin, so those subcommands are passed through to it unchanged.
 */
import { readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { which } from '../share/pi-cli/proc.ts';

const PLUGINS = join(homedir(), '.config', 'herdr', 'plugins', 'github');
const PREFIX = 'devswha.herdr-web-ui-';

/** The newest installed copy, since herdr keys the directory by source hash. */
function pluginDir(): string | null {
  let entries: string[];
  try {
    entries = readdirSync(PLUGINS).filter((name) => name.startsWith(PREFIX));
  } catch {
    return null;
  }
  const newest = entries
    .map((name) => join(PLUGINS, name))
    .filter((path) => statSync(path).isDirectory())
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
  return newest ?? null;
}

const dir = pluginDir();
if (!dir) {
  console.error(
    'hwui: plugin not installed (herdr plugin install devswha/herdr-web-ui)',
  );
  process.exit(1);
}

const bun = which('bun');
if (!bun) {
  console.error('hwui: bun must be on PATH');
  process.exit(1);
}

/** Runs the plugin's own CLI with this terminal attached, so its QR code shows. */
function plugin(...args: string[]): number {
  const child = Bun.spawnSync({
    cmd: [bun, 'scripts/plugin.ts', ...args],
    cwd: dir,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  });
  return child.exitCode ?? 1;
}

const command = process.argv[2] ?? 'up';
switch (command) {
  case 'up': {
    const started = plugin('start');
    process.exit(started === 0 ? plugin('phone') : started);
  }
  case 'down':
    process.exit(plugin('stop'));
  case 'status':
  case 'phone':
  case 'pair':
  case 'phone-setup':
    process.exit(plugin(command));
  default:
    console.error('usage: hwui [up|down|status|phone]');
    process.exit(2);
}
