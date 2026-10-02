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
