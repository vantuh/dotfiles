import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

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

/** Newest first. Directories without events.jsonl are skipped. */
export function listRuns(): { runId: string; dir: string }[] {
  const root = asyncRoot();
  return fs
    .readdirSync(root)
    .filter((name) => fs.existsSync(path.join(root, name, 'events.jsonl')))
    .map((name) => ({ runId: name, dir: path.join(root, name) }))
    .sort((a, b) => {
      const at = (dir: string): number => {
        try {
          return fs.statSync(path.join(dir, 'status.json')).mtimeMs;
        } catch {
          return 0;
        }
      };
      return at(b.dir) - at(a.dir);
    });
}

export function compactTokens(n: number | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '-';
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

export interface RunDescription {
  agent: string;
  model: string;
  thinking: string;
}

/** Static identity of a run's child, for the pane label. */
export function describeRun(runId: string): RunDescription {
  const fallback: RunDescription = { agent: 'agent', model: '', thinking: '' };
  const status = readRunStatus(runId);
  const step = status?.steps?.[0];
  if (!status || !step) return fallback;
  return {
    agent: step.agent ?? fallback.agent,
    model: shortenModel(step.model),
    thinking: step.thinking ?? '',
  };
}

interface RawStep {
  agent?: string;
  model?: string;
  thinking?: string;
  label?: string;
  workflowKey?: string;
}

/** "provider/model:thinking" -> "model" */
function shortenModel(model: string | undefined): string {
  return (model ?? '')
    .replace(/^[^/]+\//, '')
    .replace(/:[^:]*$/, '')
    .trim();
}

export function readRunStatus(runId: string):
  | {
      state?: string;
      activityState?: string;
      currentTool?: string | null;
      turnCount?: number;
      toolCount?: number;
      startedAt?: number;
      totalTokens?: { input?: number; output?: number };
      steps?: RawStep[];
    }
  | undefined {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(asyncRoot(), runId, 'status.json'), 'utf8'),
    ) as never;
  } catch {
    return undefined;
  }
}

export interface WorkflowChild {
  runId: string;
  key?: string;
  label?: string;
}

/**
 * A workflow root's own events.jsonl only carries workflow-level traces. Each
 * child is a real async run with its own artifacts, keyed by `workflowKey` in the
 * parent's steps.
 */
export function workflowChildren(workflowRunId: string): WorkflowChild[] {
  const labels = new Map<string, string | undefined>();
  for (const step of readRunStatus(workflowRunId)?.steps ?? []) {
    if (step.workflowKey) labels.set(step.workflowKey, step.label);
  }

  let lines: string;
  try {
    lines = fs.readFileSync(
      path.join(asyncRoot(), workflowRunId, 'workflow-children.jsonl'),
      'utf8',
    );
  } catch {
    return [];
  }

  const children: WorkflowChild[] = [];
  for (const line of lines.split('\n')) {
    if (!line.trim()) continue;
    try {
      const record = JSON.parse(line) as {
        type?: string;
        key?: string;
        runId?: string;
      };
      if (record.type !== 'start' || !record.runId) continue;
      children.push({
        runId: record.runId,
        key: record.key,
        label: record.key ? labels.get(record.key) : undefined,
      });
    } catch {
      // Partial or malformed record: skip it.
    }
  }
  return children;
}
