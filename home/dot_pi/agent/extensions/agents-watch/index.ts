import { execFile } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from '@earendil-works/pi-coding-agent';

import {
  compactTokens,
  listRuns,
  listRunsForSession,
  type Run,
} from './runs.ts';

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

/** Open a Herdr pane next to the current one and start the watcher inside it. */
async function openInHerdr(target: Run, focus: boolean): Promise<boolean> {
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
    await herdr(['pane', 'run', paneId, 'bun', watcher, target.runId]);
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

function activity(run_: Run): string {
  const s = run_.status;
  if (s.currentTool) return `▶ ${s.currentTool}`;
  if (s.activityState === 'active_long_running') return '⚑ long-running';
  if (s.activityState === 'waiting') return 'waiting';
  return 'thinking';
}

/** Row for the picker. Index-prefixed so selection survives display truncation. */
function label(index: number, run_: Run): string {
  const s = run_.status;
  const agents =
    (s.steps ?? []).map((step) => step.agent ?? '?').join(',') || '?';
  const turns = typeof s.turnCount === 'number' ? `${s.turnCount}t` : '?t';
  const tools = typeof s.toolCount === 'number' ? `${s.toolCount}o` : '?o';
  const tokens = s.totalTokens;
  return (
    `${index + 1}. ${agents}  ${run_.runId.slice(0, 8)}  ${elapsed(s.startedAt)}  ` +
    `${turns}/${tools}  ${activity(run_)}  ` +
    `${compactTokens(tokens?.input)}/${compactTokens(tokens?.output)}`
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
      const tokens = rawArgs.trim().split(/\s+/).filter(Boolean);
      const focus = !tokens.includes('--no-focus');
      const wanted = tokens.find((token) => !token.startsWith('--')) ?? '';

      let target: Run | undefined;
      if (wanted) {
        target = listRuns().find(
          (candidate) =>
            candidate.runId === wanted ||
            candidate.runId.startsWith(wanted) ||
            candidate.runId.slice(0, 8) === wanted.slice(0, 8),
        );
        if (!target) {
          ctx.ui.notify(`No subagent run matches "${wanted}"`, 'error');
          return;
        }
      } else {
        const { runs: active, scoped } = listRunsForSession(
          ctx.sessionManager.getSessionFile(),
        );
        if (active.length === 0) {
          const recent = listRuns()[0];
          ctx.ui.notify(
            recent
              ? `No active subagents. Newest: ${recent.runId.slice(0, 8)} (${recent.status.state ?? '?'})`
              : 'No subagent runs found',
            'info',
          );
          return;
        }
        if (active.length === 1) {
          target = active[0];
        } else {
          const options = active.map((candidate, index) =>
            label(index, candidate),
          );
          const picked = await ctx.ui.select(
            `${active.length} active subagent${active.length === 1 ? '' : 's'}${scoped ? '' : ' (any session)'}`,
            options,
          );
          if (!picked) return;
          const index = Number(picked.trim().split('.')[0]) - 1;
          const chosen = Number.isInteger(index) ? active[index] : undefined;
          if (!chosen) {
            ctx.ui.notify(`Could not match selection: ${picked}`, 'error');
            return;
          }
          target = chosen;
        }
      }

      const opened = await openInHerdr(target, focus);
      if (opened) {
        ctx.ui.notify(
          `Watching ${target.status.steps?.[0]?.agent ?? 'agent'} ${target.runId.slice(0, 8)} in a Herdr pane`,
          'info',
        );
        return;
      }
      ctx.ui.notify(
        `Herdr unavailable. Run manually:\n  bun ${watcher} ${target.runId}`,
        'warning',
      );
    },
  });
}
