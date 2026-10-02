import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export interface RunStep {
  agent?: string;
  state?: string | null;
}

export interface RunStatus {
  runId?: string;
  state?: string;
  activityState?: string;
  currentTool?: string | null;
  currentToolStartedAt?: number | null;
  lastActivityAt?: number;
  turnCount?: number;
  toolCount?: number;
  startedAt?: number;
  /** Absolute path of the parent Pi session file that launched this run. */
  sessionId?: string;
  cwd?: string;
  steps?: RunStep[];
  totalTokens?: { input?: number; output?: number; window?: number };
}

export interface Run {
  runId: string;
  dir: string;
  status: RunStatus;
}

/** Root of pi-subagents async run artifacts for this user. */
export function asyncRoot(): string {
  const direct = path.join(
    os.tmpdir(),
    `pi-subagents-uid-${process.getuid?.() ?? 0}`,
    'async-subagent-runs',
  );
  if (fs.existsSync(direct)) return direct;
  const fallback = path.join(
    os.tmpdir(),
    'pi-subagents-uid-501',
    'async-subagent-runs',
  );
  if (fs.existsSync(fallback)) return fallback;
  throw new Error(`no pi-subagents run root under ${os.tmpdir()}`);
}

function readStatus(dir: string): RunStatus | undefined {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(dir, 'status.json'), 'utf8'),
    ) as RunStatus;
  } catch {
    return undefined;
  }
}

/** Newest first. Directories without a readable status.json are skipped. */
export function listRuns(): Run[] {
  const root = asyncRoot();
  return fs
    .readdirSync(root)
    .map((name) => {
      const dir = path.join(root, name);
      const status = readStatus(dir);
      if (!status || !fs.existsSync(path.join(dir, 'events.jsonl')))
        return undefined;
      return { runId: status.runId ?? name, dir, status };
    })
    .filter((run): run is Run => run !== undefined)
    .sort((a, b) => (b.status.startedAt ?? 0) - (a.status.startedAt ?? 0));
}

export function listActiveRuns(): Run[] {
  return listRuns().filter((run) => run.status.state === 'running');
}

/**
 * Active runs launched by one Pi session. Falls back to every active run when
 * the session has no file on disk, so an in-memory session still lists something.
 */
export function listRunsForSession(sessionFile: string | undefined): {
  runs: Run[];
  scoped: boolean;
} {
  const active = listActiveRuns();
  if (!sessionFile) return { runs: active, scoped: false };
  const scoped = active.filter((run) => run.status.sessionId === sessionFile);
  return {
    runs: scoped.length > 0 ? scoped : active,
    scoped: scoped.length > 0,
  };
}

export function compactTokens(n: number | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '-';
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}
