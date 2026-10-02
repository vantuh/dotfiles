#!/usr/bin/env bun
// Read-only live view of a pi-subagents async run.
// Tails events.jsonl only: never writes artifacts, never signals the runner.
//
//   subagent-watch                 # newest run, replay then follow
//   subagent-watch --tail         # newest run, skip replay, live only
//   subagent-watch <runId> --tail # specific run, live from now
//   subagent-watch <runId> --step 1
//   subagent-watch --expanded     # start expanded (also for piping to a file)
//   subagent-watch --no-follow
//
// Ctrl+O toggles full output; ctrl-C stops.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const args = process.argv.slice(2);
const follow = !args.includes('--no-follow');
const tail = args.includes('--tail');
const stepIndex = args.includes('--step')
  ? Number(args[args.indexOf('--step') + 1])
  : undefined;
const runArg = args.find((a) => !a.startsWith('--') && a !== String(stepIndex));

function asyncRoot(): string {
  const root = path.join(
    os.tmpdir(),
    `pi-subagents-uid-${process.getuid?.() ?? 0}`,
    'async-subagent-runs',
  );
  if (fs.existsSync(root)) return root;
  const parent = path.join(os.tmpdir(), 'pi-subagents-uid-501');
  if (!fs.existsSync(parent)) {
    throw new Error(`no pi-subagents run root under ${os.tmpdir()}`);
  }
  return path.join(parent, 'async-subagent-runs');
}

function resolveRunDir(): string {
  const root = asyncRoot();
  if (runArg) {
    const dir = path.isAbsolute(runArg) ? runArg : path.join(root, runArg);
    if (!fs.existsSync(path.join(dir, 'events.jsonl')))
      throw new Error(`no events.jsonl in ${dir}`);
    return dir;
  }
  const newest = fs
    .readdirSync(root)
    .map((name) => ({
      name,
      dir: path.join(root, name),
      mtime: fs.statSync(path.join(root, name)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime)[0];
  if (!newest) throw new Error(`no runs in ${root}`);
  return newest.dir;
}

const C = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  magenta: (s: string) => `\x1b[35m${s}\x1b[0m`,
};

let expanded = args.includes('--expanded');

function firstLine(text: string, max = 160): string {
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length > max ? `${line.slice(0, max)}…` : line;
}

/** Collapsed: one clipped line. Expanded: every line, indented under the label. */
function detail(
  tag: string,
  label: string,
  text: string,
  color: (s: string) => string,
  max: number,
): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  if (!expanded) {
    console.log(`${tag}${label} ${color(firstLine(trimmed, max))}`);
    return;
  }
  console.log(`${tag}${label}`);
  for (const line of trimmed.split(/\r?\n/))
    console.log(`${tag}  ${color(line)}`);
}

function argText(args: unknown): string {
  if (!args || typeof args !== 'object') return '';
  const record = args as Record<string, unknown>;
  if (expanded) return JSON.stringify(args, null, 2);
  for (const key of ['command', 'path', 'pattern', 'prompt', 'url', 'query']) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return '';
}

function contentText(content: unknown): string {
  if (!Array.isArray(content)) return '';
  return content
    .map((part) =>
      part && typeof part === 'object' && 'text' in part
        ? String(part.text)
        : '',
    )
    .filter(Boolean)
    .join('\n');
}

const startedAt = new Map<string, number>();
const lastPartial = new Map<string, string>();

function observedAt(record: Record<string, unknown>): number | undefined {
  const value = record.observedAt;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function render(record: Record<string, unknown>): void {
  const type = String(record.type ?? '');
  const step =
    typeof record.subagentStepIndex === 'number' ? record.subagentStepIndex : 0;
  if (stepIndex !== undefined && step !== stepIndex) return;
  const tag = step > 0 ? C.dim(`[${step}] `) : '';

  switch (type) {
    case 'agent_start':
      console.log(`${tag}${C.bold('agent started')}`);
      return;
    case 'turn_start':
      console.log(`${tag}${C.dim('── turn ────────────────────────')}`);
      return;
    case 'message_end': {
      const message = record.message as Record<string, unknown> | undefined;
      if (message?.role !== 'assistant') return;
      const content = message.content as unknown;
      if (!Array.isArray(content)) return;
      for (const part of content as Record<string, unknown>[]) {
        if (
          part.type === 'thinking' &&
          typeof part.thinking === 'string' &&
          part.thinking.trim()
        ) {
          detail(tag, C.magenta('◆ think'), part.thinking, C.dim, 220);
        } else if (
          part.type === 'text' &&
          typeof part.text === 'string' &&
          part.text.trim()
        ) {
          for (const line of part.text.trim().split('\n'))
            console.log(`${tag}${line}`);
        }
      }
      return;
    }
    case 'tool_execution_start': {
      const id = String(record.toolCallId ?? record.toolName ?? '');
      startedAt.set(id, observedAt(record) ?? Date.now());
      detail(
        tag,
        `${C.cyan('▶')} ${C.bold(String(record.toolName ?? 'tool'))}`,
        argText(record.args),
        C.dim,
        160,
      );
      return;
    }
    case 'tool_execution_update': {
      const id = String(record.toolCallId ?? record.toolName ?? '');
      const text = contentText(
        (record.partialResult as Record<string, unknown> | undefined)?.content,
      );
      if (!text || text === lastPartial.get(id)) return;
      // Expanded shows only what the update added, not the whole buffer again.
      const previous = lastPartial.get(id) ?? '';
      lastPartial.set(id, text);
      const delta = text.startsWith(previous)
        ? text.slice(previous.length)
        : text;
      if (expanded) {
        detail(tag, `  ${C.dim('…')}`, delta, C.dim, 180);
        return;
      }
      console.log(
        `${tag}  ${C.dim('…')} ${C.dim(firstLine(text.slice(-200), 180))} ${C.dim(`(${text.length}b)`)}`,
      );
      return;
    }
    case 'tool_execution_end': {
      const id = String(record.toolCallId ?? record.toolName ?? '');
      const elapsed = startedAt.get(id);
      const took =
        elapsed !== undefined
          ? C.dim(
              ` ${Math.max(0, ((observedAt(record) ?? Date.now()) - elapsed) / 1000).toFixed(1)}s`,
            )
          : '';
      const mark = record.isError === true ? C.red('✗') : C.green('✓');
      detail(
        tag,
        `${mark} ${String(record.toolName ?? 'tool')}${took}`,
        contentText(
          (record.result as Record<string, unknown> | undefined)?.content,
        ),
        C.dim,
        140,
      );
      startedAt.delete(id);
      lastPartial.delete(id);
      return;
    }
    case 'subagent.run.completed':
    case 'subagent.run.stopped':
      console.log(C.bold(`── ${type} ──`));
      return;
    default:
      if (type.startsWith('subagent.') && type.includes('failed'))
        console.log(`${tag}${C.red(type)}`);
  }
}

const dir = resolveRunDir();
const events = path.join(dir, 'events.jsonl');
const status = path.join(dir, 'status.json');
const meta = JSON.parse(fs.readFileSync(status, 'utf8')) as {
  state?: string;
  cwd?: string;
  steps?: { agent?: string }[];
};

function printHeader(): void {
  console.log(
    C.bold(`run ${path.basename(dir)}`) +
      C.dim(`  state=${meta.state ?? '?'}  ${meta.cwd ?? ''}`),
  );
  for (const [index, step] of (meta.steps ?? []).entries()) {
    console.log(C.dim(`  step ${index}: ${step.agent ?? '?'}`));
  }
  console.log(C.dim(`  events: ${events}`));
  console.log(
    C.dim('─'.repeat(60)) +
      ' ' +
      (expanded
        ? C.yellow('ctrl+o: collapse')
        : C.dim('ctrl+o: expand full output')),
  );
}

let offset = tail ? fs.statSync(events).size : 0;
let buffer = '';

function drain(): void {
  const size = fs.statSync(events).size;
  if (size <= offset) return;
  const chunk = fs.readFileSync(events, { encoding: 'utf8' }).slice(offset);
  offset += Buffer.byteLength(chunk);
  buffer += chunk;
  const lines = buffer.split('\n');
  buffer = lines.pop() ?? '';
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      render(JSON.parse(line) as Record<string, unknown>);
    } catch {
      // partial or non-JSON line: drop it
    }
  }
}

function repaint(): void {
  process.stdout.write('\x1b[2J\x1b[H');
  startedAt.clear();
  lastPartial.clear();
  offset = 0;
  buffer = '';
  printHeader();
  drain();
}

printHeader();
drain();
if (!follow) process.exit(0);

if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on('data', (chunk: Buffer) => {
    const key = chunk.toString();
    if (key === '\x0f') {
      expanded = !expanded;
      repaint();
    } else if (key === '\x03' || key === 'q') {
      process.stdin.setRawMode(false);
      process.exit(0);
    }
  });
}

console.log(C.dim('─ following (ctrl-o expand · ctrl-c stop) ─'));
setInterval(() => {
  try {
    drain();
  } catch (error) {
    console.error(
      C.red(
        `read failed: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
  }
}, 400);
