import { execFile } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from '@earendil-works/pi-coding-agent';

import { compactTokens } from './runs.ts';
import { fetchSessionRuns, type ScopedRun } from './session-runs.ts';

const run = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const watcher = path.join(here, 'watch.ts');

interface PaneSplitResult {
  result?: { pane?: { pane_id?: string } };
}

async function herdr(args: string[]): Promise<string> {
  const { stdout } = await run('herdr', args, { timeout: 15_000 });
  return stdout;
}

/**
 * Split a Herdr pane and start the watcher in it. pi-subagents exports
 * `openProjectPane`, but that spawns Pi rather than an arbitrary command, so the
 * split stays hand-rolled.
 */
async function openWatcher(
  target: ScopedRun,
  focus: boolean,
): Promise<boolean> {
  let paneId: string | undefined;
  try {
    const split = JSON.parse(
      await herdr([
        'pane',
        'split',
        '--current',
        '--direction',
        'right',
        focus ? '--focus' : '--no-focus',
      ]),
    ) as PaneSplitResult;
    paneId = split.result?.pane?.pane_id;
  } catch {
    return false;
  }
  if (!paneId) return false;
  try {
    await herdr(['pane', 'run', paneId, 'bun', watcher, target.id]);
  } catch {
    await herdr(['pane', 'close', paneId]).catch(() => undefined);
    return false;
  }
  return true;
}

function elapsed(startedAt: number | undefined): string {
  if (!startedAt) return '?';
  const seconds = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, '0')}`;
}

function activity(run_: ScopedRun): string {
  const tool = run_.activity?.currentTool;
  if (tool) return `▶ ${tool}`;
  switch (run_.activity?.state) {
    case 'active_long_running':
      return '⚑ long-running';
    case 'waiting':
      return 'waiting';
    default:
      return 'thinking';
  }
}

/** Index-prefixed so the selection survives display truncation. */
function label(index: number, run_: ScopedRun): string {
  const activity_ = run_.activity ?? {};
  const turns =
    typeof activity_.turnCount === 'number' ? `${activity_.turnCount}t` : '?t';
  const tools =
    typeof activity_.toolCount === 'number' ? `${activity_.toolCount}o` : '?o';
  return (
    `${index + 1}. ${run_.label || '?'}  ${run_.id.slice(0, 8)}  ${elapsed(run_.startedAt)}  ` +
    `${turns}/${tools}  ${activity(run_)}`
  );
}

function findById(runs: ScopedRun[], wanted: string): ScopedRun | undefined {
  return runs.find(
    (candidate) =>
      candidate.id === wanted ||
      (wanted.length >= 8 && candidate.id.slice(0, wanted.length) === wanted),
  );
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand('agents-watch', {
    description: 'Watch a running subagent in a Herdr pane',
    handler: async (rawArgs: string, ctx: ExtensionCommandContext) => {
      if (ctx.mode !== 'tui') {
        ctx.ui.notify('agents-watch needs the interactive TUI', 'error');
        return;
      }

      const runs = await fetchSessionRuns(pi, ctx);
      if (runs === undefined) {
        ctx.ui.notify(
          'pi-subagents RPC is not answering, so active runs cannot be listed.',
          'error',
        );
        return;
      }

      const tokens = rawArgs.trim().split(/\s+/).filter(Boolean);
      const focus = !tokens.includes('--no-focus');
      const wanted = tokens.find((token) => !token.startsWith('--')) ?? '';

      let target: ScopedRun | undefined;
      if (wanted) {
        target = findById(runs, wanted);
        if (!target) {
          ctx.ui.notify(
            `No active run in this session matches "${wanted}"` +
              (runs.length
                ? `. Active: ${runs.map((run_) => run_.id.slice(0, 8)).join(', ')}`
                : ''),
            'error',
          );
          return;
        }
      } else if (runs.length === 0) {
        ctx.ui.notify('No active subagents in this session', 'info');
        return;
      } else if (runs.length === 1) {
        target = runs[0];
      } else {
        const picked = await ctx.ui.select(
          `${runs.length} active subagents`,
          runs.map((candidate, index) => label(index, candidate)),
        );
        if (!picked) return;
        const index = Number(picked.trim().split('.')[0]) - 1;
        target = Number.isInteger(index) ? runs[index] : undefined;
        if (!target) {
          ctx.ui.notify(`Could not match selection: ${picked}`, 'error');
          return;
        }
      }

      const opened = await openWatcher(target, focus);
      ctx.ui.notify(
        opened
          ? `Watching ${target.label || 'agent'} ${target.id.slice(0, 8)} in a Herdr pane`
          : `Herdr unavailable. Run manually:\n  bun ${watcher} ${target.id}`,
        opened ? 'info' : 'warning',
      );
    },
  });
}
