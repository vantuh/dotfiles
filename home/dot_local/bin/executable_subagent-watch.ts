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

const ANSI_SPLIT = /\x1b\[[0-9;]*m/;
const ANSI_HEAD = /^\x1b\[[0-9;]*m/;

function visibleWidth(text: string): number {
  return text.replace(ANSI_SPLIT, '').length;
}

/**
 * Wrap on visible width, carrying SGR state across the break so colour survives
 * the fold. Terminal soft-wrap cannot do this: it would drop the frame prefix
 * on every continuation line.
 */
function wrapAnsi(text: string, width: number): string[] {
  const limit = Math.max(20, width);
  const lines: string[] = [];
  let current = '';
  let active = '';
  let visible = 0;
  const break_ = (): void => {
    lines.push(current.endsWith('\x1b[0m') ? current : `${current}\x1b[0m`);
    current = active;
    visible = 0;
  };
  let i = 0;
  while (i < text.length) {
    if (text[i] === '\n') {
      lines.push(current.endsWith('\x1b[0m') ? current : `${current}\x1b[0m`);
      current = active;
      visible = 0;
      i += 1;
      continue;
    }
    const esc = ANSI_HEAD.exec(text.slice(i));
    if (esc) {
      current += esc[0];
      active = esc[0] === '\x1b[0m' ? '' : esc[0];
      i += esc[0].length;
      continue;
    }
    if (visible >= limit) {
      break_();
      continue;
    }
    current += text[i];
    visible += 1;
    i += 1;
  }
  lines.push(current.endsWith('\x1b[0m') ? current : `${current}\x1b[0m`);
  return lines;
}

/** Every physical line carries the frame bar, so folds never break the edge. */
function emit(text: string): void {
  const prefix = framePrefix();
  const width = (process.stdout.columns ?? 80) - visibleWidth(prefix) - 1;
  for (const line of wrapAnsi(text, width)) console.log(`${prefix}${line}`);
}

function framePrefix(): string {
  return turn ? `${C.dim('│')} ` : '';
}

function firstLine(text: string, max = 160): string {
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length > max ? `${line.slice(0, max)}…` : line;
}

/** Collapsed: one clipped line. Expanded: every line, indented under the label. */
function detail(
  label: string,
  text: string,
  color: (s: string) => string,
  max: number,
): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  if (!expanded) {
    emit(`${label} ${color(firstLine(trimmed, max))}`);
    return;
  }
  emit(label);
  for (const line of trimmed.split(/\r?\n/)) emit(`  ${color(line)}`);
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

function duration(ms: unknown): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return '';
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  return s < 90
    ? `${s.toFixed(1)}s`
    : `${Math.floor(s / 60)}m${Math.round(s % 60)}s`;
}

let turnNumber = 0;
let turn:
  | { start: number; tools: number; out: number; cost: number }
  | undefined;

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function render(record: Record<string, unknown>): void {
  const type = String(record.type ?? '');
  const step =
    typeof record.subagentStepIndex === 'number' ? record.subagentStepIndex : 0;
  if (stepIndex !== undefined && step !== stepIndex) return;
  const tag = step > 0 ? C.dim(`[${step}] `) : '';

  switch (type) {
    case 'agent_start':
      emit(`${tag}${C.bold('agent started')}`);
      return;
    case 'turn_start':
      turnNumber += 1;
      turn = {
        start: observedAt(record) ?? Date.now(),
        tools: 0,
        out: 0,
        cost: 0,
      };
      console.log(`${C.dim('╭')} ${C.bold(`turn ${turnNumber}`)}`);
      return;
    case 'turn_end': {
      // The message is already rendered at message_end; only close the frame.
      if (!turn) return;
      const stats = [
        duration((observedAt(record) ?? Date.now()) - turn.start),
        `${turn.tools} ${turn.tools === 1 ? 'tool' : 'tools'}`,
        `${compactTokens(turn.out)} out`,
        turn.cost > 0 ? `$${turn.cost.toFixed(3)}` : '',
      ].filter(Boolean);
      console.log(
        `${C.dim('╰')} ${C.green('done')} ${C.dim(stats.join(' · '))}`,
      );
      turn = undefined;
      return;
    }
    case 'message_end': {
      const message = record.message as Record<string, unknown> | undefined;
      if (message?.role !== 'assistant') return;
      const usage = message.usage as Record<string, unknown> | undefined;
      if (turn && usage) {
        turn.out += numberValue(usage.output);
        const cost = usage.cost as Record<string, unknown> | undefined;
        turn.cost += numberValue(cost?.total);
      }
      const content = message.content as unknown;
      if (!Array.isArray(content)) return;
      for (const part of content as Record<string, unknown>[]) {
        if (
          part.type === 'thinking' &&
          typeof part.thinking === 'string' &&
          part.thinking.trim()
        ) {
          detail(C.magenta('◆ think'), part.thinking, C.dim, 220);
        } else if (
          part.type === 'text' &&
          typeof part.text === 'string' &&
          part.text.trim()
        ) {
          for (const line of part.text.trim().split('\n'))
            emit(`${tag}${line}`);
        }
      }
      return;
    }
    case 'tool_execution_start': {
      const id = String(record.toolCallId ?? record.toolName ?? '');
      startedAt.set(id, observedAt(record) ?? Date.now());
      detail(
        `${tag}${C.cyan('▶')} ${C.bold(String(record.toolName ?? 'tool'))}`,
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
        detail(`  ${C.dim('…')}`, delta, C.dim, 180);
        return;
      }
      emit(
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
      if (turn) turn.tools += 1;
      startedAt.delete(id);
      lastPartial.delete(id);
      return;
    }
    case 'auto_retry_start': {
      const delay =
        typeof record.delayMs === 'number' ? record.delayMs / 1000 : 0;
      emit(
        `${tag}${C.yellow('↻ retry')} ${record.attempt}/${record.maxAttempts} in ${delay}s ${C.dim(firstLine(String(record.errorMessage ?? ''), 140))}`,
      );
      return;
    }
    case 'auto_retry_end':
      emit(
        record.success === true
          ? `${tag}${C.green('↻ retry ok')} ${C.dim(`attempt ${record.attempt}`)}`
          : `${tag}${C.red(`↻ retry gave up after ${record.attempt}`)} ${C.dim(firstLine(String(record.finalError ?? ''), 140))}`,
      );
      return;
    case 'subagent.control': {
      const event = record.event as Record<string, unknown> | undefined;
      if (!event) return;
      const facts = [
        typeof event.turns === 'number' ? `${event.turns} turns` : '',
        typeof event.toolCount === 'number' ? `${event.toolCount} tools` : '',
        typeof event.tokens === 'number' ? `${event.tokens} tok` : '',
        duration(event.elapsedMs),
      ].filter(Boolean);
      emit(
        `${tag}${C.yellow('⚑ control')} ${String(event.message ?? event.type ?? '')} ${C.dim(`[${facts.join(' · ')}]`)}`,
      );
      return;
    }
    case 'subagent.steer.requested':
    case 'subagent.steer.routed':
    case 'subagent.steer.queued':
    case 'subagent.steer.delivered':
    case 'subagent.steer.failed':
    case 'subagent.steer.recovered': {
      const phase = record.type.slice('subagent.steer.'.length);
      const tone =
        phase === 'failed' ? C.red : phase === 'delivered' ? C.green : C.cyan;
      const detail = firstLine(
        String(record.message ?? record.error ?? ''),
        140,
      );
      emit(
        `${tag}${tone(`⇢ steer ${phase}`)} ${detail}${C.dim(` ${String(record.requestId ?? '').slice(0, 8)}`)}`,
      );
      return;
    }
    case 'subagent.step.started':
      emit(
        `${tag}${C.bold(`── step ${record.stepIndex ?? 0}: ${record.agent ?? '?'} ──`)}`,
      );
      return;
    case 'subagent.step.completed':
      emit(
        `${tag}${C.green(`── step ${record.stepIndex ?? 0} ok`)} ${C.dim(duration(record.durationMs))}`,
      );
      return;
    case 'subagent.step.failed':
      emit(
        `${tag}${C.red(`── step ${record.stepIndex ?? 0} failed`)} ${C.dim(`exit=${record.exitCode ?? '?'} ${duration(record.durationMs)}`)}`,
      );
      return;
    case 'subagent.step.paused':
    case 'subagent.step.stopped':
      emit(
        `${tag}${C.yellow(`── step ${record.stepIndex ?? 0} ${record.type.slice(16)} ──`)}`,
      );
      return;
    case 'subagent.run.started':
    case 'subagent.run.completed':
    case 'subagent.run.stopped':
      console.log(C.bold(`── ${record.type.slice('subagent.'.length)} ──`));
      return;
    case 'agent_settled':
      emit(`${tag}${C.green('agent settled')}`);
      return;
    default:
      if (type.startsWith('subagent.') && type.includes('failed'))
        emit(`${tag}${C.red(type)}`);
  }
}

const dir = resolveRunDir();
const events = path.join(dir, 'events.jsonl');
const status = path.join(dir, 'status.json');
const meta = JSON.parse(fs.readFileSync(status, 'utf8')) as {
  state?: string;
  cwd?: string;
  steps?: { agent?: string }[];
  totalTokens?: { input?: number; output?: number; window?: number };
  steering?: { pending?: number; delivered?: number; failed?: number };
};

function compactTokens(n: number | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '-';
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

function printHeader(): void {
  const t = meta.totalTokens;
  console.log(
    C.bold(`run ${path.basename(dir)}`) +
      C.dim(`  state=${meta.state ?? '?'}  ${meta.cwd ?? ''}`),
  );
  for (const [index, step] of (meta.steps ?? []).entries()) {
    console.log(C.dim(`  step ${index}: ${step.agent ?? '?'}`));
  }
  if (t) {
    const steer = meta.steering;
    console.log(
      C.dim(
        `  tokens: in ${compactTokens(t.input)} · out ${compactTokens(t.output)} · window ${compactTokens(t.window)}` +
          (steer && (steer.pending || steer.delivered || steer.failed)
            ? `   steer: pending ${steer.pending ?? 0} · delivered ${steer.delivered ?? 0} · failed ${steer.failed ?? 0}`
            : ''),
      ),
    );
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
let lastEventAt = Date.now();
let idleBucket = 0;

// Pin a status bar to the bottom row with a scroll region, so hotkeys survive
// scrolling and ctrl+o repaints. Restored on exit.
let barRows = 0;
const realLog = console.log;

function barText(): string {
  const idle = Math.floor((Date.now() - lastEventAt) / 1000);
  const state = (meta.state ?? '?').slice(0, 12);
  const t = meta.totalTokens;
  return (
    `ctrl+o ${expanded ? 'collapse' : 'expand'} · q quit  │  ${state} · idle ${idle}s` +
    (t ? ` · in ${compactTokens(t.input)} out ${compactTokens(t.output)}` : '')
  );
}

function paintBar(): void {
  if (!barRows) return;
  const width = (process.stdout.columns ?? 80) - 1;
  const plain = ` ${barText()} `;
  // Truncate before colouring: slicing an ANSI string cuts escape sequences.
  const text =
    plain.length > width ? `${plain.slice(0, Math.max(0, width - 1))}…` : plain;
  process.stdout.write(`\x1b[${barRows};1H\x1b[2K${C.dim(text)}`);
}

function enableBar(): void {
  const rows = process.stdout.rows;
  if (!process.stdout.isTTY || !rows || rows < 8) return;
  barRows = rows;
  process.stdout.write(`\x1b[1;${rows - 1}r`);
  console.log = (...parts: unknown[]) => {
    process.stdout.write(`\x1b[${rows - 1};1H`);
    realLog(...parts);
  };
  const restore = (): void => {
    if (!barRows) return;
    barRows = 0;
    console.log = realLog;
    process.stdout.write('\x1b[r\x1b[2J\x1b[H');
  };
  process.on('exit', restore);
  process.on('SIGINT', () => {
    restore();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    restore();
    process.exit(0);
  });
  paintBar();
}

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
      lastEventAt = Date.now();
      idleBucket = 0;
    } catch {
      // partial or non-JSON line: drop it
    }
  }
}

// Silence is ambiguous on its own: report it in coarse steps instead of a timer per tick.
function idleTier(seconds: number): number {
  if (seconds < 10) return 0;
  if (seconds < 30) return 1;
  if (seconds < 60) return 2;
  return 2 + Math.floor(seconds / 60);
}

function repaint(): void {
  process.stdout.write('\x1b[2J\x1b[H');
  startedAt.clear();
  lastPartial.clear();
  turn = undefined;
  turnNumber = 0;
  offset = 0;
  buffer = '';
  lastEventAt = Date.now();
  idleBucket = 0;
  printHeader();
  drain();
  paintBar();
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

console.log(C.dim('─ following ─'));
enableBar();
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
  const idle = Math.floor((Date.now() - lastEventAt) / 1000);
  const tier = idleTier(idle);
  if (tier > idleBucket) {
    idleBucket = tier;
    console.log(
      C.dim(
        `· idle ${idle}s — no events (thinking, model latency, or waiting)`,
      ),
    );
  }
  paintBar();
}, 400);
