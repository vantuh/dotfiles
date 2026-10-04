// Test: the transcript the title model reads and the cleanup of its answer.
// Run: bun test/auto-session-name.test.ts

import type { AgentMessage } from '@earendil-works/pi-agent-core';
import type { AssistantMessage } from '@earendil-works/pi-ai';

import { buildTitleTranscript, parseGeneratedSessionTitle } from '../lib.ts';

function assert(condition: unknown, label: string): void {
  if (!condition) {
    console.error(`✗ ${label}`);
    process.exit(1);
  }
  console.log(`✓ ${label}`);
}

function text(content: string): AssistantMessage['content'] {
  return [{ type: 'text', text: content }];
}

function assistant(content: AssistantMessage['content']): AgentMessage {
  return {
    role: 'assistant',
    content,
    api: 'test',
    provider: 'test',
    model: 'test-model',
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: 'stop',
    timestamp: 0,
  };
}

function user(content: string): AgentMessage {
  return { role: 'user', content, timestamp: 0 };
}

function toolResult(): AgentMessage {
  return {
    role: 'toolResult',
    toolCallId: '1',
    toolName: 'read',
    content: [{ type: 'text', text: 'TOOL OUTPUT' }],
    isError: false,
    timestamp: 0,
  };
}

function bash(command: string, output: string): AgentMessage {
  return {
    role: 'bashExecution',
    command,
    output,
    exitCode: 0,
    cancelled: false,
    truncated: false,
    timestamp: 0,
  };
}

function compactionSummary(summary: string): AgentMessage {
  return { role: 'compactionSummary', summary, tokensBefore: 10, timestamp: 0 };
}

{
  const cases: ReadonlyArray<readonly [string, string]> = [
    ['标题：修复 SSE 重连。', '修复 SSE 重连'],
    ['Назва: Виправлення реконекту', 'Виправлення реконекту'],
    ['заголовок - Міграція', 'Міграція'],
    ['Title: Fix login bug', 'Fix login bug'],
    ['```json\n{"title":"整理 Session 文件夹"}\n```', '整理 Session 文件夹'],
    ['```\nFix login bug\n```', 'Fix login bug'],
    [
      '"Improve worktree session grouping"',
      'Improve worktree session grouping',
    ],
    ['«Дві черги»', '«Дві черги»'],
    ['Fix login bug.\nSecond line is dropped.', 'Fix login bug'],
    ['  Дві   черги  ', 'Дві черги'],
  ];
  for (const [raw, expected] of cases) {
    assert(
      parseGeneratedSessionTitle(raw) === expected,
      `${JSON.stringify(raw)} becomes ${JSON.stringify(expected)}`,
    );
  }
}

{
  const capped = parseGeneratedSessionTitle('я'.repeat(200));
  assert(
    Array.from(capped).length === 80,
    'a title is capped at 80 code points',
  );
}

{
  for (const raw of ['...', '```\n---\n```', '   ', '']) {
    let rejected = false;
    try {
      parseGeneratedSessionTitle(raw);
    } catch {
      rejected = true;
    }
    assert(rejected, `${JSON.stringify(raw)} is rejected as a title`);
  }
}

{
  const longUser = `${'first '.repeat(199)}last`;
  const transcript = buildTitleTranscript([
    user(longUser),
    assistant(text('working on it')),
    toolResult(),
    assistant(text('Done: added the retry wrapper')),
  ]);
  assert(
    !transcript.includes('TOOL OUTPUT'),
    'tool results never reach the model',
  );
  assert(
    transcript.includes('Assistant: Done: added the retry wrapper'),
    'the conversation text survives',
  );
  const userLine = transcript.split('\n\n')[0];
  assert(
    userLine.length === 'User: '.length + 800 + 1 && userLine.endsWith('…'),
    'a long user turn is clipped at 800 code points',
  );
  assert(
    transcript.startsWith('User: '),
    'the opening turn leads the transcript',
  );
}

{
  const transcript = buildTitleTranscript([
    user('run it'),
    bash('git log --oneline', 'BASH OUTPUT'),
    compactionSummary('earlier work'),
    assistant(text('done')),
  ]);
  assert(
    transcript.includes('Ran `git log --oneline`'),
    'a bash command is kept',
  );
  assert(!transcript.includes('BASH OUTPUT'), 'bash output is dropped');
  assert(
    transcript.includes('[Earlier summary] earlier work'),
    'a compaction summary is kept',
  );
}

{
  const longReply = 'x'.repeat(500);
  const transcript = buildTitleTranscript([
    user('do the thing'),
    assistant(text(longReply)),
    assistant([
      { type: 'toolCall', id: '1', name: 'read', arguments: {} },
    ] as AssistantMessage['content']),
  ]);
  assert(
    transcript.includes(longReply),
    'a tool-call-only reply does not take the larger cap from the last text reply',
  );
}

{
  const intermediate = 'x'.repeat(500);
  const transcript = buildTitleTranscript([
    user('do the thing'),
    assistant(text(intermediate)),
    assistant(text('final reply')),
  ]);
  assert(
    !transcript.includes('x'.repeat(301)),
    'an intermediate reply is clipped at 300 code points',
  );
}

{
  const messages: AgentMessage[] = [];
  for (let index = 0; index < 40; index += 1) {
    messages.push(user(`turn ${index} ${'y'.repeat(300)}`));
    messages.push(assistant(text(`reply ${index}`)));
  }
  const transcript = buildTitleTranscript(messages);
  assert(transcript.length <= 6000, 'the transcript stays inside its budget');
  assert(transcript.includes('[…]'), 'the middle of a long session is elided');
  assert(transcript.includes('User: turn 0'), 'the opening turn survives');
  assert(transcript.includes('reply 39'), 'the newest reply survives');
}
