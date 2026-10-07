// Run: bun test/watch.test.ts
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const watch = join(dirname(fileURLToPath(import.meta.url)), '../watch.ts');

function visible(events: unknown[], extra: string[] = []): string {
  const dir = mkdtempSync(join(tmpdir(), 'agents-watch-'));
  try {
    writeFileSync(join(dir, 'status.json'), '{"state":"complete"}\n');
    writeFileSync(
      join(dir, 'events.jsonl'),
      `${events.map((event) => JSON.stringify(event)).join('\n')}\n`,
    );
    const proc = spawnSync(
      'bun',
      [watch, dir, '--no-follow', ...extra],
      { encoding: 'utf8' },
    );
    assert.equal(proc.status, 0, proc.stderr || proc.stdout);
    return proc.stdout.replace(/\x1b\[[0-9;]*m/g, '');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function update(assistantMessageEvent: Record<string, unknown>): unknown {
  return { type: 'message_update', assistantMessageEvent };
}

const streamed = visible([
  { type: 'turn_start' },
  update({
    type: 'thinking_delta',
    contentIndex: 0,
    delta: 'Шукаю фільтр shouldPersistChildEvent\nBODY-SHOULD-HIDE',
  }),
  update({
    type: 'thinking_end',
    contentIndex: 0,
    content: 'Шукаю фільтр shouldPersistChildEvent\nBODY-SHOULD-HIDE',
  }),
  update({ type: 'text_delta', contentIndex: 1, delta: 'Лог ріже ' }),
  update({ type: 'text_delta', contentIndex: 1, delta: 'стрім до запису.\n' }),
  update({
    type: 'toolcall_start',
    contentIndex: 2,
    id: 'call-grep',
    toolName: 'grep',
  }),
  update({
    type: 'toolcall_delta',
    contentIndex: 2,
    delta: '{"pattern":"shouldPersistChildEvent"}',
  }),
  update({
    type: 'toolcall_end',
    contentIndex: 2,
    toolCall: {
      type: 'toolCall',
      id: 'call-grep',
      name: 'grep',
      arguments: { pattern: 'shouldPersistChildEvent' },
    },
  }),
  {
    type: 'message_end',
    message: {
      role: 'assistant',
      usage: { output: 12, cost: { total: 0.1 } },
      content: [
        {
          type: 'thinking',
          thinking: 'Шукаю фільтр shouldPersistChildEvent\nBODY-SHOULD-HIDE',
        },
        { type: 'text', text: 'Лог ріже стрім до запису.\n' },
        {
          type: 'toolCall',
          id: 'call-grep',
          name: 'grep',
          arguments: { pattern: 'shouldPersistChildEvent' },
        },
      ],
    },
  },
  { type: 'turn_end' },
]);

assert.equal(
  streamed.split('Шукаю фільтр shouldPersistChildEvent').length - 1,
  1,
);
assert.equal(streamed.includes('BODY-SHOULD-HIDE'), false);
assert.equal(streamed.split('Лог ріже стрім до запису.').length - 1, 1);
assert.match(streamed, /▶ grep/);
assert.match(streamed, /shouldPersistChildEvent/);
assert.equal(streamed.split('▶').length - 1, 1);
assert.match(streamed, /1 tool/);

const bridged = visible([
  { type: 'turn_start' },
  update({
    type: 'toolcall_end',
    contentIndex: 0,
    toolCall: {
      type: 'toolCall',
      id: 'call-read',
      name: 'read',
      arguments: { path: 'watch.ts' },
    },
  }),
  {
    type: 'tool_execution_start',
    toolCallId: 'call-read',
    toolName: 'read',
    args: { path: 'watch.ts' },
  },
  {
    type: 'tool_execution_end',
    toolCallId: 'call-read',
    toolName: 'read',
    isError: false,
    result: { content: [{ type: 'text', text: 'file body' }] },
  },
  { type: 'turn_end' },
]);

assert.equal(bridged.split('▶').length - 1, 1);
assert.match(bridged, /✓ read/);
assert.match(bridged, /1 tool/);

const finalOnly = visible([
  { type: 'turn_start' },
  {
    type: 'message_end',
    message: {
      role: 'assistant',
      content: [
        { type: 'thinking', thinking: 'лише фінал' },
        { type: 'text', text: 'готово' },
      ],
    },
  },
  { type: 'turn_end' },
]);

assert.match(finalOnly, /◆ think/);
assert.match(finalOnly, /лише фінал/);
assert.match(finalOnly, /готово/);

const expanded = visible(
  [
    { type: 'turn_start' },
    update({
      type: 'thinking_end',
      contentIndex: 0,
      content: 'Шукаю фільтр\nBODY-SHOULD-HIDE',
    }),
    {
      type: 'message_end',
      message: {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'Шукаю фільтр\nBODY-SHOULD-HIDE' },
        ],
      },
    },
    { type: 'turn_end' },
  ],
  ['--expanded'],
);

assert.equal(expanded.split('BODY-SHOULD-HIDE').length - 1, 1);
