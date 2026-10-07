#!/usr/bin/env bun
// Read-only live view of a pi-subagents async run.
// Tails events.jsonl only: never writes artifacts, never signals the runner.
//
//   watch                 # newest run, replay then follow
//   watch --tail          # newest run, skip replay, live only
//   watch <runId> --tail  # specific run, live from now
//   watch <runId> --step 1
//   watch --expanded      # start expanded (also for piping to a file)
//   watch --no-follow
//
// Ctrl+O toggles full output; ctrl-C stops.

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { asyncRoot, compactTokens, listRuns } from './runs.ts';

const args = process.argv.slice(2);
const follow = !args.includes('--no-follow');
const tail = args.includes('--tail');
const stepIndex = args.includes('--step')
  ? Number(args[args.indexOf('--step') + 1])
  : undefined;
const runArg = args.find((a) => !a.startsWith('--') && a !== String(stepIndex));

function resolveRunDir(): string {
  const runs = listRuns();
  if (runArg) {
    const dir = path.isAbsolute(runArg)
      ? runArg
      : path.join(asyncRoot(), runArg);
    if (!fs.existsSync(path.join(dir, 'events.jsonl')))
      throw new Error(`no events.jsonl in ${dir}`);
    return dir;
  }
  const newest = runs[0];
  if (!newest) throw new Error(`no runs under ${asyncRoot()}`);
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
  bar: (s: string) => `\x1b[48;5;236m\x1b[38;5;252m${s}\x1b[0m`,
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

type StreamBlock = {
  kind: 'text' | 'thinking' | 'tool';
  pending: string;
  shown: boolean;
  gap: boolean;
  toolName?: string;
  toolId?: string;
};

const blocks = new Map<number, StreamBlock>();
const announced = new Set<string>();

function resetStream(): void {
  blocks.clear();
  announced.clear();
  startedAt.clear();
  lastPartial.clear();
}

function streamBlock(
  index: number,
  kind: StreamBlock['kind'],
): StreamBlock {
  const existing = blocks.get(index);
  if (existing?.kind === kind) return existing;
  const created: StreamBlock = { kind, pending: '', shown: false, gap: false };
  blocks.set(index, created);
  return created;
}

function firstContentLine(text: string): string {
  return text.trimStart().split(/\r?\n/, 1)[0] ?? '';
}

function toolArgs(value: unknown, pending: string): unknown {
  if (value && typeof value === 'object') return value;
  const raw = typeof value === 'string' && value.trim() ? value : pending;
  if (!raw.trim()) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

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

/** Full-width lifecycle rule; spans the pane instead of a bare inline label. */
function rule(label: string, color: (s: string) => string): void {
  const width = (process.stdout.columns ?? 80) - 1;
  const head = `── ${label} `;
  const fill = Math.max(0, width - visibleWidth(head));
  console.log(color(`${head}${'─'.repeat(fill)}`));
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
      blocks.clear();
      announced.clear();
      turn = {
        start: observedAt(record) ?? Date.now(),
        tools: 0,
        out: 0,
        cost: 0,
      };
      console.log(`${C.dim('╭')} ${C.bold(C.cyan(`turn ${turnNumber}`))}`);
      return;
    case 'turn_end': {
      // The message is already rendered at message_end; only close the frame.
      if (!turn) return;
      const tools = Math.max(turn.tools, announced.size);
      const stats = [
        duration((observedAt(record) ?? Date.now()) - turn.start),
        `${tools} ${tools === 1 ? 'tool' : 'tools'}`,
        `${compactTokens(turn.out)} out`,
        turn.cost > 0 ? `$${turn.cost.toFixed(3)}` : '',
      ].filter(Boolean);
      console.log(
        `${C.dim('╰')} ${C.bold(C.green('✓ done'))} ${C.dim(stats.join(' · '))}`,
      );
      turn = undefined;
      blocks.clear();
      announced.clear();
      return;
    }
    case 'message_start':
      blocks.clear();
      return;
    case 'message_update': {
      const event = record.assistantMessageEvent;
      if (!event || typeof event !== 'object') return;
      const update = event as Record<string, unknown>;
      const index =
        typeof update.contentIndex === 'number' ? update.contentIndex : 0;
      const kind = String(update.type ?? '');
      if (kind === 'text_delta' || kind === 'text_end') {
        const block = streamBlock(index, 'text');
        const delta =
          kind === 'text_end'
            ? block.shown || block.pending
              ? ''
              : typeof update.content === 'string'
                ? update.content
                : ''
            : typeof update.delta === 'string'
              ? update.delta
              : '';
        const flush = kind === 'text_end';
        block.pending += delta;
        const lines = block.pending.split('\n');
        block.pending = flush ? '' : (lines.pop() ?? '');
        for (const line of lines) {
          if (!line.trim()) {
            if (block.shown) block.gap = true;
            continue;
          }
          if (block.gap) {
            emit('');
            block.gap = false;
          }
          emit(`${tag}${line}`);
          block.shown = true;
        }
        return;
      }
      if (kind === 'thinking_delta' || kind === 'thinking_end') {
        const block = streamBlock(index, 'thinking');
        if (typeof update.delta === 'string') block.pending += update.delta;
        const text =
          kind === 'thinking_end' && typeof update.content === 'string'
            ? update.content
            : block.pending;
        if (block.shown || !text.trim()) return;
        if (kind !== 'thinking_end' && (expanded || !text.includes('\n')))
          return;
        const line = expanded ? text.trim() : firstContentLine(text);
        if (!line) return;
        detail(C.magenta('◆ think'), line, C.dim, 220);
        block.shown = true;
        return;
      }
      if (kind === 'toolcall_start') {
        const block = streamBlock(index, 'tool');
        if (typeof update.toolName === 'string') block.toolName = update.toolName;
        if (typeof update.id === 'string') block.toolId = update.id;
        return;
      }
      if (kind === 'toolcall_delta') {
        const block = streamBlock(index, 'tool');
        if (typeof update.delta === 'string') block.pending += update.delta;
        return;
      }
      if (kind === 'toolcall_end') {
        const block = streamBlock(index, 'tool');
        const call = update.toolCall as Record<string, unknown> | undefined;
        const id = String(call?.id ?? block.toolId ?? `tool:${index}`);
        const name = String(call?.name ?? block.toolName ?? 'tool');
        if (announced.has(id)) return;
        announced.add(id);
        detail(
          `${tag}${C.cyan('▶')} ${C.bold(name)}`,
          argText(toolArgs(call?.arguments, block.pending)),
          C.dim,
          160,
        );
        return;
      }
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
      for (const [index, part] of (content as Record<string, unknown>[]).entries()) {
        if (
          part.type === 'thinking' &&
          typeof part.thinking === 'string' &&
          part.thinking.trim()
        ) {
          // ponytail: a streamed thinking block is final. message_end does not reprint it.
          if (blocks.get(index)?.shown) continue;
          const line = expanded ? part.thinking : firstContentLine(part.thinking);
          detail(C.magenta('◆ think'), line, C.dim, 220);
        } else if (
          part.type === 'text' &&
          typeof part.text === 'string' &&
          part.text.trim()
        ) {
          const block = blocks.get(index);
          if (block?.kind === 'text' && (block.shown || block.pending)) {
            if (block.pending.trim()) emit(`${tag}${block.pending.trim()}`);
            block.pending = '';
            block.shown = true;
            continue;
          }
          for (const line of part.text.trim().split('\n'))
            emit(`${tag}${line}`);
        }
      }
      return;
    }
    case 'tool_execution_start': {
      const id = String(record.toolCallId ?? '');
      const key = id || String(record.toolName ?? 'tool');
      startedAt.set(key, observedAt(record) ?? Date.now());
      if (id && announced.has(id)) return;
      announced.add(key);
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
      const body = contentText(
        (record.result as Record<string, unknown> | undefined)?.content,
      );
      detail(
        tag,
        body
          ? `${mark} ${String(record.toolName ?? 'tool')}${took}\n${body}`
          : `${mark} ${String(record.toolName ?? 'tool')}${took}`,
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
      rule(`step ${record.stepIndex ?? 0}: ${record.agent ?? '?'}`, (s) =>
        C.bold(C.cyan(s)),
      );
      return;
    case 'subagent.step.completed':
      rule(
        `step ${record.stepIndex ?? 0} ok · ${duration(record.durationMs)}`,
        C.green,
      );
      return;
    case 'subagent.step.failed':
      rule(
        `step ${record.stepIndex ?? 0} failed · exit=${record.exitCode ?? '?'} · ${duration(record.durationMs)}`,
        C.red,
      );
      return;
    case 'subagent.step.paused':
    case 'subagent.step.stopped':
      rule(
        `step ${record.stepIndex ?? 0} ${record.type.slice('subagent.step.'.length)}`,
        C.yellow,
      );
      return;
    case 'subagent.run.started':
    case 'subagent.run.completed':
    case 'subagent.run.stopped': {
      const name = record.type.slice('subagent.run.'.length);
      rule(
        `run ${name}`,
        name === 'completed'
          ? C.bold(C.green)
          : name === 'stopped'
            ? C.bold(C.yellow)
            : C.bold(C.cyan),
      );
      return;
    }
    case 'agent_settled':
      rule('agent settled', C.green);
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
  totalTokens?: { input?: number; output?: number };
};

let metaReadAt = 0;

/** status.json keeps growing while the run works, so the bar re-reads it. */
function refreshMeta(): void {
  const now = Date.now();
  if (now - metaReadAt < 1_500) return;
  metaReadAt = now;
  try {
    Object.assign(meta, JSON.parse(fs.readFileSync(status, 'utf8')) as object);
  } catch {
    // A partial write is not worth reporting; the next tick picks it up.
  }
}

let offset = tail ? fs.statSync(events).size : 0;
let buffer = '';
let lastEventAt = Date.now();

// Pin a status bar to the bottom row with a scroll region, so hotkeys survive
// scrolling and ctrl+o repaints. Restored on exit.
let barRows = 0;
let logRow = 1;
const realLog = console.log;

/**
 * Bar parts in priority order. `paintBar` appends them while they fit and drops
 * the rest, so a narrow stacked pane keeps hotkeys and idle over tokens.
 */
function barSegments(): string[] {
  const idle = Math.floor((Date.now() - lastEventAt) / 1000);
  const state = (meta.state ?? '?').slice(0, 12);
  const t = meta.totalTokens;
  return [
    ` ctrl+o ${expanded ? 'collapse' : 'expand'} · q quit`,
    ` │ ${state}`,
    ` · idle ${idle}s`,
    ...(t
      ? [` · in ${compactTokens(t.input)} out ${compactTokens(t.output)}`]
      : []),
  ];
}

function paintBar(): void {
  if (!barRows) return;
  refreshMeta();
  const width = process.stdout.columns ?? 80;
  const right = follow ? ' following ' : ' replay ';

  let text = '';
  for (const segment of barSegments()) {
    const candidate = `${text}${segment}`;
    if (candidate.length + right.length > width) break;
    text = candidate;
  }
  // Pad so the background fills the row instead of ending mid-text.
  text =
    text.length + right.length >= width
      ? text.slice(0, width)
      : text + ' '.repeat(width - text.length - right.length) + right;
  // Erase and repaint in one write so a width change never shows a blank row.
  process.stdout.write(`\x1b[${barRows};1H\x1b[K${C.bar(text)}`);
}

function enableBar(): void {
  if (!process.stdout.isTTY || !process.stdout.rows || process.stdout.rows < 8)
    return;

  // Re-apply the pinned region only when the row count changes. A width-only
  // resize keeps the region, so the terminal does not reflow the log and the
  // footer just repaints in place.
  let pinnedRows = 0;
  const applyBar = (): void => {
    const rows = process.stdout.rows;
    if (!rows || rows < 8) {
      // Too short to pin a bar: release the region, stop intercepting output, and
      // wipe the row so the last painted bar cannot linger as a log fragment.
      if (barRows) {
        process.stdout.write(`\x1b[r\x1b[${barRows};1H\x1b[K`);
      }
      barRows = 0;
      pinnedRows = 0;
      return;
    }
    if (rows !== pinnedRows) {
      process.stdout.write(`\x1b[1;${rows - 1}r`);
      pinnedRows = rows;
      if (logRow > rows - 1) logRow = Math.max(1, rows - 1);
      process.stdout.write(`\x1b[${rows};1H`);
    }
    barRows = rows;
    paintBar();
  };

  console.log = (...parts: unknown[]) => {
    if (barRows) {
      const last = barRows - 1;
      const row = Math.min(Math.max(logRow, 1), last);
      process.stdout.write(`\x1b[${row};1H`);
      logRow = row >= last ? last : row + 1;
    }
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
  process.on('SIGWINCH', applyBar);
  applyBar();
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
    } catch {
      // partial or non-JSON line: drop it
    }
  }
}

function repaint(): void {
  process.stdout.write('\x1b[2J\x1b[H');
  logRow = 1;
  resetStream();
  turn = undefined;
  turnNumber = 0;
  offset = 0;
  buffer = '';
  lastEventAt = Date.now();
  drain();
  paintBar();
}

// Pin the bar before the replay, so later lines continue under it instead of
// jumping to the bottom row of an otherwise short log.
if (follow) enableBar();
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
      quit();
    }
  });
}

/**
 * A watcher pane is disposable, so quitting closes the pane it runs in. Outside
 * Herdr there is no pane to close and the process just exits. `--keep-pane`
 * always exits without touching the layout.
 */
function quit(): void {
  const paneId =
    process.env.HERDR_ENV === '1' ? process.env.HERDR_PANE_ID : undefined;
  if (paneId && !args.includes('--keep-pane')) {
    try {
      execFileSync('herdr', ['pane', 'close', paneId], {
        stdio: 'ignore',
        timeout: 5_000,
      });
    } catch {
      // The pane may already be gone; leaving it is not worth failing over.
    }
  }
  process.exit(0);
}

/**
 * A settled run cannot produce further events, so there is nothing left to
 * follow. Without a terminal on stdout no key can quit and no pane is kept
 * open, which would leave a detached watcher polling a finished log forever:
 * end it instead. An interactive pane is left alone so `q` still decides when
 * the last frame goes away. `paused` is not settled: a paused run can resume.
 */
const SETTLED_STATES = new Set([
  'complete',
  'failed',
  'partial',
  'stopped',
  'rejected',
]);

function exitWhenSettled(): void {
  if (process.stdout.isTTY) return;
  refreshMeta();
  if (!meta.state || !SETTLED_STATES.has(meta.state)) return;
  drain();
  process.exit(0);
}

setInterval(() => {
  try {
    drain();
    exitWhenSettled();
  } catch (error) {
    console.error(
      C.red(
        `read failed: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
  }
  paintBar();
}, 400);
