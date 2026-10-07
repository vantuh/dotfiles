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

const paragraphs = visible([
  { type: 'turn_start' },
  update({ type: 'text_delta', contentIndex: 0, delta: 'перший абзац\n\n' }),
  update({ type: 'text_delta', contentIndex: 0, delta: 'другий абзац\n' }),
  {
    type: 'message_end',
    message: {
      role: 'assistant',
      content: [{ type: 'text', text: 'перший абзац\n\nдругий абзац\n' }],
    },
  },
  { type: 'turn_end' },
]);
const paragraphLines = paragraphs.split('\n');
const firstParagraph = paragraphLines.findIndex((line) =>
  line.includes('перший абзац'),
);
const secondParagraph = paragraphLines.findIndex((line) =>
  line.includes('другий абзац'),
);
assert.equal(secondParagraph, firstParagraph + 2);
assert.equal(paragraphLines[firstParagraph + 1].replace(/│/g, '').trim(), '');
assert.equal(paragraphs.split('перший абзац').length - 1, 1);

const leadingThink = visible([
  { type: 'turn_start' },
  update({
    type: 'thinking_delta',
    contentIndex: 0,
    delta: '\nреальний рядок\nтіло thinking',
  }),
  update({
    type: 'thinking_end',
    contentIndex: 0,
    content: '\nреальний рядок\nтіло thinking',
  }),
  {
    type: 'message_end',
    message: {
      role: 'assistant',
      content: [
        { type: 'thinking', thinking: '\nреальний рядок\nтіло thinking' },
      ],
    },
  },
  { type: 'turn_end' },
]);

assert.equal(leadingThink.split('реальний рядок').length - 1, 1);
assert.equal(leadingThink.includes('тіло thinking'), false);

const leadingFinal = visible([
  { type: 'turn_start' },
  {
    type: 'message_end',
    message: {
      role: 'assistant',
      content: [{ type: 'thinking', thinking: '\nлише після переносу' }],
    },
  },
  { type: 'turn_end' },
]);

assert.match(leadingFinal, /лише після переносу/);

// A short replay must not pin the next live line to the bottom row.
{
  const dir = mkdtempSync(join(tmpdir(), 'agents-watch-pty-'));
  const events = join(dir, 'events.jsonl');
  writeFileSync(events, `${JSON.stringify({ type: 'turn_start' })}\n`);
  writeFileSync(join(dir, 'status.json'), '{"state":"running"}\n');
  const probe = spawnSync(
    'python3',
    [
      '-c',
      `
import fcntl, os, pty, select, struct, termios, time
rows = 24
master, slave = pty.openpty()
fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", rows, 80, 0, 0))
pid = os.fork()
if pid == 0:
    os.setsid()
    os.dup2(slave, 0)
    os.dup2(slave, 1)
    os.dup2(slave, 2)
    os.close(master)
    os.close(slave)
    os.execvp("bun", ["bun", ${JSON.stringify(watch)}, ${JSON.stringify(dir)}])
os.close(slave)
buf = b""
deadline = time.time() + 3
while time.time() < deadline and b"turn 1" not in buf:
    ready, _, _ = select.select([master], [], [], 0.2)
    if ready:
        buf += os.read(master, 65536)
with open(${JSON.stringify(events)}, "a") as fh:
    fh.write(${JSON.stringify(JSON.stringify({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text: 'HELLO-LINE' }] } }) + '\n')})
deadline = time.time() + 2
while time.time() < deadline and b"HELLO-LINE" not in buf:
    ready, _, _ = select.select([master], [], [], 0.2)
    if ready:
        buf += os.read(master, 65536)
os.kill(pid, 15)
os.waitpid(pid, 0)
open(${JSON.stringify(join(dir, 'screen.bin'))}, "wb").write(buf)
`,
    ],
    { encoding: 'utf8' },
  );
  assert.equal(probe.status, 0, probe.stderr || probe.stdout);
  const screen = Buffer.from(
    // python wrote the capture; read it back without the bun runner's tty.
    spawnSync('cat', [join(dir, 'screen.bin')]).stdout,
  );
  assert.equal(screen.includes(Buffer.from('HELLO-LINE')), true, screen.toString());
  assert.equal(
    screen.includes(Buffer.from('\x1b[23;1H')),
    false,
    'live line jumped to the bottom row',
  );
  rmSync(dir, { recursive: true, force: true });
}
