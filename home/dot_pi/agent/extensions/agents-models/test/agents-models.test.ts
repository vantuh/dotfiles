// Test: the /agents-models picker step machine and the settings write it drives.
// Run: bun test/agents-models.test.ts

import {
  mkdtempSync,
  readFileSync,
  lstatSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import type { Theme } from '@earendil-works/pi-coding-agent';
import type { KeybindingsManager, TUI } from '@earendil-works/pi-tui';

import { AgentModelPicker, type PickerData } from '../picker.ts';
import { type SettingsScope, writeAgentModelOverride } from '../settings.ts';

function assert(condition: unknown, label: string): void {
  if (!condition) {
    console.error(`✗ ${label}`);
    process.exit(1);
  }
  console.log(`✓ ${label}`);
}

const KEYS: Record<string, string> = {
  '\r': 'tui.select.confirm',
  '\x1b': 'tui.select.cancel',
  '\x1b[A': 'tui.select.up',
  '\x1b[B': 'tui.select.down',
};

function createPicker(data: PickerData) {
  const results: unknown[] = [];
  const theme = {
    fg: (_color: string, text: string) => text,
    bold: (text: string) => text,
  } as unknown as Theme;
  const tui = { requestRender: () => {} } as unknown as TUI;
  const keybindings = {
    matches: (data: string, id: string) => KEYS[data] === id,
  } as unknown as KeybindingsManager;
  const picker = new AgentModelPicker(tui, theme, keybindings, data, (result) =>
    results.push(result),
  );
  return { picker, results };
}

const data: PickerData = {
  agentItems: [
    {
      value: 'oracle',
      label: 'oracle',
      description: 'user override: kiro-acp/claude-opus-5',
    },
    {
      value: 'worker',
      label: 'worker',
      description: 'user override: kiro-acp/claude-sonnet-5',
    },
  ],
  modelItems: () => [
    {
      value: 'openai-codex/gpt-6.1-sol',
      label: 'openai-codex/gpt-6.1-sol',
      description: 'scoped · GPT-6.1 Sol',
    },
    {
      value: '__clear__',
      label: 'clear override',
      description: 'remove the pinned model',
    },
  ],
  scopeItems: () => [
    {
      value: 'user',
      label: 'User settings',
      description: '/home/u/.pi/agent/settings.json',
    },
    {
      value: 'project',
      label: 'Project settings',
      description: '/repo/.pi/settings.json',
    },
  ],
};

{
  const { picker, results } = createPicker(data);
  assert(
    picker.render(80).join('\n').includes('1/3 agent'),
    'starts on the agent step',
  );

  picker.handleInput('w'); // typed characters filter instead of navigating
  picker.handleInput('\r');
  const filtered = picker.render(80).join('\n');
  assert(
    !filtered.includes('oracle') && filtered.includes('worker'),
    'filtering keeps only matching agents',
  );

  picker.handleInput('\x1b');
  assert(
    picker.render(80).join('\n').includes('1/3 agent'),
    'escape goes back to the agent step',
  );

  picker.handleInput('\x1b');
  assert(
    results.length === 1 && results[0] === null,
    'escape on step 1 cancels',
  );

  picker.handleInput('\r'); // oracle
  assert(
    picker.render(80).join('\n').includes('2/3 model for oracle'),
    'enter advances to the model step',
  );

  picker.handleInput('\r'); // first model
  assert(
    picker.render(80).join('\n').includes('3/3 write to'),
    'enter advances to the scope step',
  );

  picker.handleInput('\x1b[B'); // move to project settings
  picker.handleInput('\r');
  assert(
    JSON.stringify(results.at(-1)) ===
      JSON.stringify({
        agent: 'oracle',
        model: 'openai-codex/gpt-6.1-sol',
        scopeKind: 'project',
      }),
    'confirming returns agent, model and scope',
  );
}

{
  const { picker, results } = createPicker(data);
  picker.handleInput('\r');
  picker.handleInput('\x1b[B'); // clear override
  picker.handleInput('\r');
  picker.handleInput('\r');
  assert(
    JSON.stringify(results.at(-1)) ===
      JSON.stringify({ agent: 'oracle', model: null, scopeKind: 'user' }),
    'the clear-override entry reports a null model',
  );
}

{
  const dir = mkdtempSync(path.join(tmpdir(), 'agents-models-'));
  const file = path.join(dir, 'settings.json');
  writeFileSync(
    file,
    `${JSON.stringify(
      {
        theme: 'dark',
        subagents: {
          agentOverrides: {
            scout: { model: 'a/b', thinking: 'minimal' },
            oracle: { model: 'c/d' },
          },
        },
      },
      null,
      2,
    )}\n`,
  );
  const scope: SettingsScope = { kind: 'user', path: file };

  writeAgentModelOverride(scope, 'oracle', 'e/f');
  writeAgentModelOverride(scope, 'new-agent', 'inherit');
  writeAgentModelOverride(scope, 'scout', null);

  const written = JSON.parse(readFileSync(file, 'utf8')) as {
    theme: string;
    subagents: {
      agentOverrides: Record<string, Record<string, unknown>>;
    };
  };
  assert(written.theme === 'dark', 'unrelated settings keys survive');
  assert(
    written.subagents.agentOverrides.oracle.model === 'e/f',
    'an existing override is updated',
  );
  assert(
    written.subagents.agentOverrides['new-agent'].model === 'inherit',
    'a new agent is added',
  );
  assert(
    written.subagents.agentOverrides.scout.thinking === 'minimal' &&
      written.subagents.agentOverrides.scout.model === undefined,
    'clearing a model keeps the other override fields',
  );
  assert(
    readFileSync(file, 'utf8').endsWith('}\n'),
    'the file keeps its trailing newline',
  );
}

{
  const dir = mkdtempSync(path.join(tmpdir(), 'agents-models-link-'));
  const real = path.join(dir, 'real-settings.json');
  const link = path.join(dir, 'settings.json');
  writeFileSync(real, '{}\n');
  symlinkSync(real, link);

  writeAgentModelOverride({ kind: 'user', path: link }, 'worker', 'a/b');

  assert(
    lstatSync(link).isSymbolicLink(),
    'a symlinked target stays a symlink',
  );
  assert(
    JSON.parse(readFileSync(real, 'utf8')).subagents.agentOverrides.worker
      .model === 'a/b',
    'the write lands in the symlink target',
  );
}
