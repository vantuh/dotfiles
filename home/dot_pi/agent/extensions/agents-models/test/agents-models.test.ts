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

import { type DiscoveredAgent, selectPinnableAgents } from '../agents.ts';
import {
  AgentModelPicker,
  type PickerData,
  type PickerResult,
} from '../picker.ts';
import {
  profileSettingsScopes,
  type SettingsScope,
  writeAgentModelOverride,
} from '../settings.ts';

function assert(condition: unknown, label: string): void {
  if (!condition) {
    console.error(`✗ ${label}`);
    process.exit(1);
  }
  console.log(`✓ ${label}`);
}

const KEYS: Record<string, string> = {
  '\r': 'tui.select.confirm',
  '\t': 'tui.input.tab',
  '\x1b': 'tui.select.cancel',
  '\x1b[A': 'tui.select.up',
  '\x1b[B': 'tui.select.down',
};

interface Harness {
  readonly picker: AgentModelPicker;
  readonly results: PickerResult[];
  readonly closed: boolean[];
  readonly applied: PickerResult[];
  settle: () => Promise<void>;
}

function createPicker(
  data: () => PickerData,
  apply?: (result: PickerResult) => Promise<string | undefined>,
): Harness {
  const results: PickerResult[] = [];
  const closed: boolean[] = [];
  const applied: PickerResult[] = [];
  const theme = {
    fg: (_color: string, text: string) => text,
    bold: (text: string) => text,
  } as unknown as Theme;
  const tui = { requestRender: () => {} } as unknown as TUI;
  const keybindings = {
    matches: (data: string, id: string) => KEYS[data] === id,
  } as unknown as KeybindingsManager;
  const picker = new AgentModelPicker(
    tui,
    theme,
    keybindings,
    data,
    async (result) => {
      applied.push(result);
      return apply ? await apply(result) : undefined;
    },
    (changed) => closed.push(changed),
  );
  return {
    picker,
    results,
    closed,
    applied,
    // Lets a test await the picker's save-then-return-to-agents cycle.
    settle: () => new Promise((resolve) => setTimeout(resolve, 0)),
  };
}

const USER_SCOPE: SettingsScope = {
  kind: 'user',
  path: '/home/u/.pi/agent/settings.json',
  label: 'global',
};
const PROJECT_SCOPE: SettingsScope = {
  kind: 'project',
  path: '/repo/.pi/settings.json',
  label: 'local',
};
const PROFILE_SCOPE: SettingsScope = {
  kind: 'profile',
  path: '/home/u/.pi/agent/profiles/pi-subagents/kiro-acp.json',
  label: 'profile: kiro-acp',
};

const data: PickerData = {
  agentItems: () => [
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
  modelItems: (agent) => [
    {
      value: 'openai-codex/gpt-6.1-sol',
      label: 'openai-codex/gpt-6.1-sol',
      description: 'scoped \u00b7 GPT-6.1 Sol',
    },
    {
      value: '__clear__',
      label: 'clear override',
      description: `remove the pinned model for ${agent}`,
    },
  ],
  scopes: [USER_SCOPE, PROJECT_SCOPE, PROFILE_SCOPE],
};

{
  const { picker, applied, closed, settle } = createPicker(() => data);
  assert(
    picker.render(80).join('\n').includes('Subagent model \u00b7 agent'),
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
    picker.render(80).join('\n').includes('Subagent model \u00b7 agent'),
    'escape goes back to the agent step',
  );

  picker.handleInput('\x1b');
  assert(
    JSON.stringify(closed) === '[false]',
    'escape on step 1 closes with nothing changed',
  );

  assert(
    picker.render(80).join('\n').includes('target: global'),
    'the target starts on global',
  );

  picker.handleInput('\t');
  assert(
    picker.render(80).join('\n').includes('target: local'),
    'tab switches the target to local',
  );
  picker.handleInput('\t');
  assert(
    picker.render(80).join('\n').includes('target: profile: kiro-acp'),
    'tab reaches the saved profiles',
  );
  picker.handleInput('\t');
  assert(
    picker.render(80).join('\n').includes('target: global'),
    'tab wraps back to global',
  );

  picker.handleInput('\r'); // oracle
  assert(
    picker
      .render(80)
      .join('\n')
      .includes('Subagent model \u00b7 model for oracle'),
    'enter advances to the model step',
  );

  picker.handleInput('\t'); // pick the local target
  picker.handleInput('\r'); // first model
  assert(
    JSON.stringify(applied) ===
      JSON.stringify([
        {
          agent: 'oracle',
          model: 'openai-codex/gpt-6.1-sol',
          scopeKind: 'project',
        },
      ]),
    'saving applies the tab-selected scope',
  );

  await settle();
  const afterSave = picker.render(80).join('\n');
  assert(
    afterSave.includes('Subagent model \u00b7 agent'),
    'saving returns to the agent step instead of closing',
  );
  assert(
    afterSave.includes('saved oracle \u2192 openai-codex/gpt-6.1-sol'),
    'the saved pin is reported in the modal',
  );

  picker.handleInput('\x1b');
  assert(
    JSON.stringify(closed) === '[false,true]',
    'closing after a save reports the change',
  );
}

{
  const { picker, applied, settle } = createPicker(() => data);
  picker.handleInput('\r');
  picker.handleInput('\x1b[B'); // clear override
  picker.handleInput('\r');
  await settle();
  assert(
    JSON.stringify(applied) ===
      JSON.stringify([{ agent: 'oracle', model: null, scopeKind: 'user' }]),
    'the clear-override entry applies a null model',
  );
}

{
  const { picker, applied } = createPicker(() => ({
    ...data,
    scopes: [USER_SCOPE],
  }));
  assert(
    !picker.render(80).join('\n').includes('[tab]'),
    'a single scope hides the tab hint',
  );
  picker.handleInput('\t');
  picker.handleInput('\r');
  picker.handleInput('\r');
  assert(
    JSON.stringify(applied) ===
      JSON.stringify([
        {
          agent: 'oracle',
          model: 'openai-codex/gpt-6.1-sol',
          scopeKind: 'user',
        },
      ]),
    'tab is inert without a local scope',
  );
}

{
  const { picker } = createPicker(() => ({
    ...data,
    scopes: [USER_SCOPE],
    localMissingNote: 'local: no project settings for this project',
  }));
  assert(
    picker
      .render(80)
      .join('\n')
      .includes('local: no project settings for this project'),
    'the missing local scope is reported mid-modal',
  );
}

{
  const { picker, closed, settle } = createPicker(
    () => data,
    async () => 'Failed to write /repo/.pi/settings.json: nope',
  );
  picker.handleInput('\r');
  picker.handleInput('\r');
  await settle();
  const afterError = picker.render(80).join('\n');
  assert(
    afterError.includes('Failed to write /repo/.pi/settings.json: nope'),
    'a failed write is reported in the modal',
  );
  assert(
    afterError.includes('Subagent model \u00b7 agent'),
    'a failed write still returns to the agent step',
  );
  picker.handleInput('\x1b');
  assert(
    JSON.stringify(closed) === '[false]',
    'a failed write does not count as a change',
  );
}

{
  const scopes = profileSettingsScopes();
  assert(
    scopes.every((scope) => scope.kind === 'profile'),
    'profile scopes are only profile files',
  );
  for (const scope of scopes) {
    assert(
      scope.label === `profile: ${path.basename(scope.path, '.json')}`,
      `a profile scope is labelled from its file name (${scope.label})`,
    );
  }
}

{
  const agent = (name: string, disabled: boolean): DiscoveredAgent => ({
    name,
    origin: 'builtin',
    disabled,
  });
  const { pinnable, hiddenCount } = selectPinnableAgents([
    agent('worker', false),
    agent('council-opus', false),
    agent('claude-code', true),
    agent('reviewer', true),
  ]);
  assert(
    pinnable.map((entry) => entry.name).join(',') === 'worker,council-opus',
    'only disabled agents drop out of the picker',
  );
  assert(hiddenCount === 2, 'the hidden count covers every dropped agent');
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
