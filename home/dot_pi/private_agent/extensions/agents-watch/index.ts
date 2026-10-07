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

/** Argument and picker row that open every active run in one go. */
const ALL = 'all';

interface OpenOutcome {
  run: ScopedRun;
  created?: boolean;
  paneId?: string;
  error?: string;
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

/** Trailing picker row: one watcher pane per active run, in list order. */
function allOption(count: number): string {
  return `${count + 1}. ${ALL}  open all ${count} active subagents`;
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
        label:
          [child.key, child.label].filter(Boolean).join(' · ') || run.label,
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

/** One row per run, plus a trailing `all` row once there is a choice to batch. */
function pickerOptions(runs: ScopedRun[]): string[] {
  const options = runs.map((candidate, index) => label(index, candidate));
  if (runs.length > 1) options.push(allOption(runs.length));
  return options;
}

/**
 * Runs to open: every one for `all`, the matched run for an id prefix, otherwise
 * the interactive picker. Undefined means the user cancelled or the problem was
 * already reported, so the caller has nothing left to say.
 */
async function resolveTargets(
  runs: ScopedRun[],
  wanted: string,
  ctx: ExtensionCommandContext,
): Promise<ScopedRun[] | undefined> {
  if (wanted.toLowerCase() === ALL) return runs;
  if (wanted) {
    const target = findById(runs, wanted);
    if (target) return [target];
    ctx.ui.notify(
      `No active run in this session matches "${wanted}"` +
        (runs.length
          ? `. Active: ${runs.map((run_) => run_.id.slice(0, 8)).join(', ')}`
          : ''),
      'error',
    );
    return undefined;
  }
  if (runs.length === 0) return [];

  // Always pick, even for a single run: opening is a deliberate action.
  const picked = await ctx.ui.select(
    runs.length === 1 ? '1 active subagent' : `${runs.length} active subagents`,
    pickerOptions(runs),
  );
  if (!picked) return undefined;
  const index = Number(picked.trim().split('.')[0]) - 1;
  if (index === runs.length) return runs;
  const target = Number.isInteger(index) ? runs[index] : undefined;
  if (target) return [target];
  ctx.ui.notify(`Could not match selection: ${picked}`, 'error');
  return undefined;
}

/** Sequential: each split re-reads the layout, so parallel opens would race. */
async function openWatchPanes(
  targets: ScopedRun[],
  cwd: string,
): Promise<OpenOutcome[]> {
  const outcomes: OpenOutcome[] = [];
  for (const target of targets) {
    try {
      const result = await openWatchPane(target.id, cwd, [
        'bun',
        watcher,
        target.id,
      ]);
      outcomes.push({
        run: target,
        created: result.created,
        paneId: result.paneId,
      });
    } catch (error) {
      outcomes.push({
        run: target,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return outcomes;
}

function reportOutcome(
  outcome: OpenOutcome,
  ctx: ExtensionCommandContext,
): void {
  if (outcome.error) {
    ctx.ui.notify(
      `Could not open a Herdr pane: ${outcome.error}\n` +
        `Run manually:  bun ${watcher} ${outcome.run.id}`,
      'error',
    );
    return;
  }
  ctx.ui.notify(
    outcome.created
      ? `Watching ${outcome.run.label || 'agent'} ${outcome.run.id.slice(0, 8)} in pane ${outcome.paneId}`
      : `${outcome.run.label || 'agent'} ${outcome.run.id.slice(0, 8)} is already open in pane ${outcome.paneId}`,
    outcome.created ? 'info' : 'warning',
  );
}

function reportOutcomes(
  outcomes: OpenOutcome[],
  ctx: ExtensionCommandContext,
): void {
  if (outcomes.length === 1) {
    reportOutcome(outcomes[0], ctx);
    return;
  }

  const opened = outcomes.filter((outcome) => outcome.created).length;
  const existing = outcomes.filter(
    (outcome) => !outcome.created && !outcome.error,
  ).length;
  const failures = outcomes.filter((outcome) => outcome.error);
  const summary = [
    opened > 0 ? `${opened} opened` : undefined,
    existing > 0 ? `${existing} already open` : undefined,
    failures.length
      ? `${failures.length} failed (${failures
          .map((failure) => `${failure.run.id.slice(0, 8)}: ${failure.error}`)
          .join('; ')})`
      : undefined,
  ].filter(Boolean);
  ctx.ui.notify(
    `Watchers: ${summary.join(', ')}`,
    failures.length ? 'error' : 'info',
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

      const fetched = await fetchSessionRuns(pi);
      if (fetched === undefined) {
        ctx.ui.notify(
          'pi-subagents RPC is not answering, so active runs cannot be listed.',
          'error',
        );
        return;
      }

      const tokens = rawArgs.trim().split(/\s+/).filter(Boolean);
      const wanted = tokens.find((token) => !token.startsWith('--')) ?? '';
      const targets = await resolveTargets(flatten(fetched), wanted, ctx);
      if (!targets) return;
      if (targets.length === 0) {
        ctx.ui.notify('No active subagents in this session', 'info');
        return;
      }

      reportOutcomes(await openWatchPanes(targets, ctx.cwd), ctx);
    },
  });
}
