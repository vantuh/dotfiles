import { execFile } from 'node:child_process';
import { createConnection } from 'node:net';
import { promisify } from 'node:util';

import { describeRun } from './runs.ts';

const run = promisify(execFile);

/** Pane label prefix; the rest of the label is the run id. */
export const LABEL_PREFIX = 'agents-watch:';

/**
 * Dedup key from a pane label: the token right after the prefix, truncated to the
 * short id. Normalising keeps labels written before the descriptive format from
 * opening a second pane for a run that is already watched.
 */
export function labelRunId(
  label: string | null | undefined,
): string | undefined {
  if (!label?.startsWith(LABEL_PREFIX)) return undefined;
  return (
    label.slice(LABEL_PREFIX.length).split(' ')[0]?.slice(0, 8) || undefined
  );
}

/** `agents-watch:<id8> · <agent> · <model> · <thinking>` */
function watchLabel(runId: string): string {
  const id = runId.slice(0, 8);
  const { agent, model, thinking } = describeRun(runId);
  return [LABEL_PREFIX + id, agent, model, thinking]
    .filter(Boolean)
    .join(' · ');
}

export interface PaneInfo {
  pane_id: string;
  tab_id?: string;
  workspace_id?: string;
  label?: string | null;
  rect?: { x: number; y: number; width: number; height: number };
}

/**
 * Layout tree as returned by `layout.export`. `first`/`second` order encodes the
 * path used by `layout.set_split_ratio`.
 */
export type LayoutNode =
  | { type: 'pane'; pane_id?: string }
  | {
      type: 'split';
      direction: 'right' | 'down';
      ratio: number;
      first: LayoutNode;
      second: LayoutNode;
    };

async function herdr(args: string[]): Promise<string> {
  const { stdout } = await run('herdr', args, { timeout: 15_000 });
  return stdout;
}

/** Minimal client for the Herdr socket, which the CLI does not expose for layout. */
function herdrApi<T>(
  method: string,
  params: Record<string, unknown>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const socketPath = process.env.HERDR_SOCKET_PATH;
    if (!socketPath) {
      reject(new Error('HERDR_SOCKET_PATH is not set.'));
      return;
    }
    const socket = createConnection(socketPath);
    let buffer = '';
    let settled = false;

    const finish = (error?: Error, value?: T): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) reject(error);
      else resolve(value as T);
    };

    socket.setEncoding('utf8');
    socket.on('connect', () => {
      const request = {
        id: `agents-watch:${process.pid}:${Date.now()}`,
        method,
        params,
      };
      socket.write(`${JSON.stringify(request)}\n`);
    });
    socket.on('data', (chunk: string) => {
      buffer += chunk;
      const newline = buffer.indexOf('\n');
      if (newline < 0) return;
      try {
        const parsed = JSON.parse(buffer.slice(0, newline)) as {
          result?: T;
          error?: { message?: string };
        };
        if (parsed.error)
          finish(new Error(parsed.error.message ?? 'Herdr API error'));
        else finish(undefined, parsed.result as T);
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    });
    socket.on('error', (error) => finish(error));
    socket.setTimeout(5_000, () =>
      finish(new Error(`Herdr API ${method} timed out`)),
    );
  });
}

function area(pane: PaneInfo): number {
  const rect = pane.rect;
  return rect ? rect.width * rect.height : 0;
}

export async function currentPane(): Promise<PaneInfo> {
  const parsed = JSON.parse(await herdr(['pane', 'current'])) as {
    result?: { pane?: PaneInfo };
  };
  const pane = parsed.result?.pane;
  if (!pane?.pane_id)
    throw new Error('Could not resolve the current Herdr pane.');
  return pane;
}

export async function paneLayout(paneId: string): Promise<{
  tabId: string;
  panes: PaneInfo[];
}> {
  const parsed = JSON.parse(
    await herdr(['pane', 'layout', '--pane', paneId]),
  ) as {
    result?: { layout?: { tab_id?: string; panes?: PaneInfo[] } };
  };
  const layout = parsed.result?.layout;
  if (!layout?.tab_id) throw new Error('Could not read the Herdr pane layout.');
  return { tabId: layout.tab_id, panes: layout.panes ?? [] };
}

/**
 * Panes of the current tab. `pane layout` carries rects but no label or tab, so
 * the labels come from `pane list` and the two are merged by pane id.
 */
async function tabPanes(paneId: string): Promise<PaneInfo[]> {
  const [layout, listed] = await Promise.all([
    paneLayout(paneId),
    (async () => {
      const parsed = JSON.parse(await herdr(['pane', 'list'])) as {
        result?: { panes?: PaneInfo[] };
      };
      return parsed.result?.panes ?? [];
    })(),
  ]);
  const byId = new Map(listed.map((pane) => [pane.pane_id, pane]));
  return layout.panes.map((pane) => {
    const meta = byId.get(pane.pane_id);
    return { ...meta, ...pane, tab_id: meta?.tab_id ?? layout.tabId };
  });
}

export async function exportLayout(
  paneId: string,
): Promise<{ tabId: string; root: LayoutNode }> {
  const result = await herdrApi<{
    layout?: { tab_id?: string; root?: LayoutNode };
  }>('layout.export', { pane_id: paneId });
  const layout = result?.layout;
  if (!layout?.tab_id || !layout.root)
    throw new Error('Malformed layout.export response.');
  return { tabId: layout.tab_id, root: layout.root };
}

/** Watch panes in the given tab, keyed by run id. */
export async function listWatchPanes(): Promise<Map<string, PaneInfo>> {
  const current = await currentPane();
  const { tabId } = await paneLayout(current.pane_id);
  const watch = new Map<string, PaneInfo>();
  for (const pane of await tabPanes(current.pane_id)) {
    if (pane.tab_id && pane.tab_id !== tabId) continue;
    const runId = labelRunId(pane.label);
    if (runId) watch.set(runId, pane);
  }
  return watch;
}

function countManaged(node: LayoutNode, managed: ReadonlySet<string>): number {
  if (node.type === 'pane')
    return node.pane_id && managed.has(node.pane_id) ? 1 : 0;
  return countManaged(node.first, managed) + countManaged(node.second, managed);
}

/**
 * Balance every `down` split that has watchers on both sides by count. `right`
 * splits are left alone so the Pi column keeps its width.
 */
export function buildEqualRatios(
  node: LayoutNode,
  managed: ReadonlySet<string>,
): { path: boolean[]; ratio: number }[] {
  const updates: { path: boolean[]; ratio: number }[] = [];
  const visit = (current: LayoutNode, path: boolean[]): void => {
    if (current.type === 'pane') return;
    const first = countManaged(current.first, managed);
    const second = countManaged(current.second, managed);
    if (current.direction === 'down' && first > 0 && second > 0) {
      updates.push({ path, ratio: first / (first + second) });
    }
    if (first > 0) visit(current.first, [...path, false]);
    if (second > 0) visit(current.second, [...path, true]);
  };
  visit(node, []);
  return updates;
}

export async function rebalance(
  rootPaneId: string,
  managedPaneIds: readonly string[],
): Promise<void> {
  const { tabId, root } = await exportLayout(rootPaneId);
  for (const update of buildEqualRatios(root, new Set(managedPaneIds))) {
    await herdrApi('layout.set_split_ratio', {
      tab_id: tabId,
      path: update.path,
      ratio: update.ratio,
    });
  }
}

export interface OpenResult {
  paneId: string;
  created: boolean;
}

/**
 * Add a watcher pane to the column: the first one splits right of Pi, every
 * later one splits down inside the largest existing watcher pane.
 */
export async function openWatchPane(
  runId: string,
  cwd: string,
  command: string[],
): Promise<OpenResult> {
  const current = await currentPane();
  const { tabId } = await paneLayout(current.pane_id);
  const existing = new Map<string, PaneInfo>();
  for (const pane of await tabPanes(current.pane_id)) {
    if (pane.tab_id && pane.tab_id !== tabId) continue;
    const key = labelRunId(pane.label);
    if (!key) continue;
    existing.set(key, pane);
  }

  const already = existing.get(runId.slice(0, 8));
  if (already) return { paneId: already.pane_id, created: false };

  const managed = [...existing.values()];
  const target = [...managed].sort((a, b) => area(b) - area(a))[0];
  const parsed = JSON.parse(
    await herdr([
      'pane',
      'split',
      target?.pane_id ?? current.pane_id,
      '--direction',
      target ? 'down' : 'right',
      '--ratio',
      target ? '0.5' : '0.6',
      '--cwd',
      cwd,
      '--no-focus',
    ]),
  ) as { result?: { pane?: PaneInfo } };
  const pane = parsed.result?.pane;
  if (!pane?.pane_id)
    throw new Error(
      'Malformed pane split response: missing result.pane.pane_id.',
    );

  await herdr([
    'pane',
    'rename',
    pane.pane_id,
    ...watchLabel(runId).split(' '),
  ]);
  await herdr(['pane', 'run', pane.pane_id, ...command]);
  await rebalance(current.pane_id, [
    ...managed.map((entry) => entry.pane_id),
    pane.pane_id,
  ]);
  return { paneId: pane.pane_id, created: true };
}
