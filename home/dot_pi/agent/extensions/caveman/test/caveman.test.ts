// Test: the caveman extension's skill loading, command surface, session-state
// restoration, and prompt section, driven through the real registered handlers.
// Run: bun test/caveman.test.ts

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

import cavemanExtension, {
  loadSkill,
  parseCommand,
  resolveMode,
  skillCandidates,
} from '../index.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = mkdtempSync(join(tmpdir(), 'caveman-test-'));
process.on('exit', () => rmSync(root, { recursive: true, force: true }));
function tempDir(name: string): string {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  return dir;
}

// A hermetic agent dir proves the extension resolves SKILL.md through
// getAgentDir()/PI_CODING_AGENT_DIR without reading the live ~/.pi tree.
const agentDir = tempDir('agent');
mkdirSync(join(agentDir, 'skills/caveman'), { recursive: true });
writeFileSync(
  join(agentDir, 'skills/caveman/SKILL.md'),
  '---\nname: caveman\ndescription: sentinel\n---\n\n# caveman\n\nSENTINEL-CAVEMAN-RULE\n',
);
process.env.PI_CODING_AGENT_DIR = agentDir;

const modeEntry = (mode: string) => ({
  type: 'custom',
  customType: 'caveman-mode',
  data: { mode },
});

function harness(hasUi = true) {
  type Handler = (event: unknown, ctx: unknown) => unknown;
  const registered: { event: string; handler: Handler }[] = [];
  const entries: { customType: string; data: unknown }[] = [];
  const statuses: (string | undefined)[] = [];
  const notifications: string[] = [];
  let command: Handler = () => {};
  let branch: unknown[] = [];
  let idle = true;

  const stub = {
    on(event: string, handler: Handler) {
      registered.push({ event, handler });
    },
    registerCommand(_name: string, options: { handler: Handler }) {
      command = options.handler;
    },
    appendEntry(customType: string, data: unknown) {
      entries.push({ customType, data });
    },
  };
  cavemanExtension(stub as unknown as ExtensionAPI);

  const ctx = {
    hasUI: hasUi,
    isIdle: () => idle,
    ui: hasUi
      ? {
          setStatus(_key: string, text: string | undefined) {
            statuses.push(text);
          },
          notify(message: string) {
            notifications.push(message);
          },
        }
      : undefined,
    sessionManager: { getBranch: () => branch },
  };
  const fire = async (event: string, payload: unknown) => {
    for (const r of registered)
      if (r.event === event) await r.handler(payload, ctx);
  };

  return {
    entries,
    statuses,
    setIdle(value: boolean) {
      idle = value;
    },
    sessionStart: async (reason = 'startup', next?: unknown[]) => {
      if (next) branch = next;
      await fire('session_start', { type: 'session_start', reason });
    },
    treeSwitch: async (next: unknown[]) => {
      branch = next;
      await fire('session_tree', {});
    },
    prompt: async (sections: Record<string, string> = {}) => {
      await fire('before_agent_start', { systemPromptOptions: { sections } });
      return sections;
    },
    command: (args: string) => command(args, ctx) as Promise<void>,
    status: () => statuses.at(-1),
    message: () => notifications.at(-1),
  };
}

// -- pure helpers ----------------------------------------------------------

const parsed: Array<[string, unknown]> = [
  ['', { kind: 'toggle' }],
  ['  ', { kind: 'toggle' }],
  ['ON', { kind: 'set', mode: 'on' }],
  [' off ', { kind: 'set', mode: 'off' }],
  ['status', { kind: 'status' }],
  ['ultra', { kind: 'invalid', arg: 'ultra' }],
  ['on extra', { kind: 'invalid', arg: 'on extra' }],
];
for (const [raw, expected] of parsed)
  assert.deepEqual(parseCommand(raw), expected);

const branches: Array<[unknown, unknown]> = [
  [undefined, 'on'],
  [[], 'on'],
  [[modeEntry('off')], 'off'],
  [[modeEntry('off'), modeEntry('on'), modeEntry('off')], 'off'],
  [
    [{ type: 'custom', customType: 'ponytail-mode', data: { mode: 'off' } }],
    'on',
  ],
  [[{ type: 'custom', customType: 'caveman-mode' }], 'on'],
];
for (const [entries, expected] of branches)
  assert.equal(
    resolveMode(entries as Parameters<typeof resolveMode>[0]),
    expected,
  );

// -- skill loading ---------------------------------------------------------

const skillDir = tempDir('skill');
const skill = join(skillDir, 'SKILL.md');
writeFileSync(
  skill,
  '---\nname: caveman\ndescription: >\n  folded\n---\n\n# caveman\n\nRULE LINE\n',
);
assert.equal(loadSkill([skill]), '# caveman\n\nRULE LINE');
assert.equal(
  loadSkill([join(skillDir, 'missing.md'), skill]),
  '# caveman\n\nRULE LINE',
);
assert.throws(
  () => loadSkill([join(skillDir, 'missing.md')]),
  /not found or empty[\s\S]*missing\.md/,
);
writeFileSync(join(skillDir, 'empty.md'), '---\nname: x\n---\n');
assert.throws(
  () => loadSkill([join(skillDir, 'empty.md')]),
  /not found or empty/,
);
assert.throws(
  () => loadSkill([skillDir]),
  (error: unknown) =>
    error instanceof Error &&
    error.message.includes('unreadable at') &&
    error.message.includes(skillDir),
);

const repoSkill = loadSkill([
  resolve(here, '../../../../..', '.agents/skills/caveman/SKILL.md'),
]);
assert.match(repoSkill, /# caveman/);
assert.match(repoSkill, /Answer first/);
assert.doesNotMatch(repoSkill, /name: caveman/);
assert.deepEqual(skillCandidates('/agent', '/agent/extensions/caveman'), [
  '/agent/skills/caveman/SKILL.md',
  '/agent/skills/caveman/SKILL.md',
]);

{
  // A missing skill fails the factory before it registers anything, so no ON
  // section or footer status can come from absent rules.
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = tempDir('missing');
  let registered = false;
  const stub = {
    on: () => {
      registered = true;
    },
    registerCommand: () => {
      registered = true;
    },
    appendEntry: () => {},
  };
  assert.throws(
    () => cavemanExtension(stub as unknown as ExtensionAPI),
    /not found or empty[\s\S]*SKILL\.md/,
  );
  assert.equal(registered, false, 'nothing registered without rules');
  process.env.PI_CODING_AGENT_DIR = previous;
}

// -- handlers --------------------------------------------------------------

{
  // Fresh ON default, command surface, busy notification, OFF prompt.
  const h = harness();
  await h.sessionStart();
  assert.equal(h.status(), '🗿 caveman: ON');
  const on = await h.prompt();
  assert.match(on.caveman, /CAVEMAN MODE ON/);
  assert.match(on.caveman, /SENTINEL-CAVEMAN-RULE/);
  assert.doesNotMatch(on.caveman, /name: caveman/);

  await h.command('off');
  assert.equal(h.status(), '🗿 caveman: OFF');
  assert.deepEqual(h.entries, [
    { customType: 'caveman-mode', data: { mode: 'off' } },
  ]);
  const off = await h.prompt({
    caveman: on.caveman,
    ponytail: 'PONY',
    preamble: 'P',
  });
  assert.match(off.caveman, /CAVEMAN MODE OFF/);
  assert.match(off.caveman, /Ignore every Caveman instruction/);
  assert.doesNotMatch(off.caveman, /SENTINEL-CAVEMAN-RULE/);
  assert.deepEqual(
    { ponytail: off.ponytail, preamble: off.preamble },
    { ponytail: 'PONY', preamble: 'P' },
    'other sections are untouched',
  );

  await h.command('off');
  assert.equal(h.entries.length, 1, 'a repeated /caveman off appends nothing');
  await h.command('on');
  assert.equal(h.status(), '🗿 caveman: ON');
  assert.equal(h.entries.length, 2);
  await h.command('status');
  assert.equal(h.message(), 'caveman: ON');
  assert.equal(h.entries.length, 2, '/caveman status persists nothing');
  await h.command('ultra');
  assert.match(h.message()!, /Unknown \/caveman argument: ultra/);
  assert.equal(h.entries.length, 2, 'an unknown argument changes no state');
  assert.equal(h.status(), '🗿 caveman: ON');

  h.setIdle(false);
  await h.command('off');
  assert.equal(
    h.status(),
    '🗿 caveman: OFF',
    'the footer shows the selected mode',
  );
  assert.match(h.message()!, /applies to the next agent run/);
  h.setIdle(true);
  await h.command('');
  assert.equal(h.status(), '🗿 caveman: ON', 'a bare /caveman toggles');
  assert.equal(h.message(), 'caveman: ON', 'an idle command has no suffix');
}

{
  const h = harness();
  await h.sessionStart('reload', [modeEntry('off')]);
  assert.equal(h.status(), '🗿 caveman: OFF', 'reload keeps the saved OFF');
  const off = await h.prompt();
  assert.match(off.caveman, /CAVEMAN MODE OFF/);
  assert.doesNotMatch(off.caveman, /SENTINEL-CAVEMAN-RULE/);
}

{
  const h = harness();
  await h.sessionStart('startup', [modeEntry('on')]);
  await h.treeSwitch([modeEntry('off')]);
  assert.equal(
    h.status(),
    '🗿 caveman: OFF',
    'a tree switch restores the branch',
  );
  await h.treeSwitch([modeEntry('on')]);
  assert.equal(h.status(), '🗿 caveman: ON');
}

{
  const h = harness(false);
  await h.sessionStart();
  await h.prompt();
  await h.command('off');
  await h.command('status');
  assert.deepEqual(h.statuses, [], 'a no-UI context never calls setStatus');
}

console.log('caveman extension: all checks passed');
