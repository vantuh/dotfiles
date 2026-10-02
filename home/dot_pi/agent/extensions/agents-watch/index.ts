import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from '@earendil-works/pi-coding-agent';

import { openWatchPane } from './panes.ts';
import { readRunStatus, workflowChildren } from './runs.ts';
import { fetchSessionRuns, type ScopedRun } from './session-runs.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const watcher = path.join(here, 'watch.ts');

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

/**
 * A workflow root's own log holds only workflow-level traces, so the picker lists
 * its children instead. Each child is a real async run with its own artifacts.
 */
function flatten(runs: ScopedRun[]): ScopedRun[] {
  const rows: ScopedRun[] = [];
  for (const run of runs) {
    const children = workflowChildren(run.id);
    if (children.length === 0) {
      rows.push(run);
      continue;
    }
    for (const child of children) {
      const status = readRunStatus(child.runId);
      rows.push({
        id: child.runId,
        label: [child.key, child.label].filter(Boolean).join(' · ') || run.label,
        state: (status?.state as ScopedRun['state']) ?? 'running',
        startedAt: status?.startedAt,
        activity: {
          state: status?.activityState,
          currentTool: status?.currentTool ?? undefined,
          turnCount: status?.turnCount,
          toolCount: status?.toolCount,
        },
      });
    }
  }
  return rows;
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand('agents-watch', {
    description: 'Watch a running subagent in a Herdr pane',
    handler: async (rawArgs: string, ctx: ExtensionCommandContext) => {
      if (ctx.mode !== 'tui') {
        ctx.ui.notify('agents-watch needs the interactive TUI', 'error');
        return;
      }

      const fetched = await fetchSessionRuns(pi);
      if (fetched === undefined) {
        ctx.ui.notify(
          'pi-subagents RPC is not answering, so active runs cannot be listed.',
          'error',
        );
        return;
      }

      const runs = flatten(fetched);
      const tokens = rawArgs.trim().split(/\s+/).filter(Boolean);
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
      } else {
        // Always pick, even for a single run: opening is a deliberate action.
        const picked = await ctx.ui.select(
          runs.length === 1
            ? '1 active subagent'
            : `${runs.length} active subagents`,
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

      let result;
      try {
        result = await openWatchPane(target.id, ctx.cwd, [
          'bun',
          watcher,
          target.id,
        ]);
      } catch (error) {
        ctx.ui.notify(
          `Could not open a Herdr pane: ${error instanceof Error ? error.message : String(error)}\n` +
            `Run manually:  bun ${watcher} ${target.id}`,
          'error',
        );
        return;
      }
      ctx.ui.notify(
        result.created
          ? `Watching ${target.label || 'agent'} ${target.id.slice(0, 8)} in pane ${result.paneId}`
          : `${target.label || 'agent'} ${target.id.slice(0, 8)} is already open in pane ${result.paneId}`,
        result.created ? 'info' : 'warning',
      );
    },
  });
}
