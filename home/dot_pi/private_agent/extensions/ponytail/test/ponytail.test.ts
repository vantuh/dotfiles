// Test: the ponytail extension's skill loading, command surface, session-state
// restoration, and prompt section, driven through the real registered handlers.
// Run: bun test/ponytail.test.ts

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

import ponytailExtension, {
  loadSkill,
  parseCommand,
  promptSection,
  resolveMode,
  skillCandidates,
} from '../index.ts';

const root = mkdtempSync(join(tmpdir(), 'ponytail-test-'));
process.on('exit', () => rmSync(root, { recursive: true, force: true }));
function tempDir(name: string): string {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  return dir;
}

const agentDir = tempDir('agent');
mkdirSync(join(agentDir, 'skills/ponytail'), { recursive: true });
writeFileSync(
  join(agentDir, 'skills/ponytail/SKILL.md'),
  '---\nname: ponytail\ndescription: sentinel\n---\n\n# Ponytail\n\nSENTINEL-PONYTAIL-RULE\n',
);
process.env.PI_CODING_AGENT_DIR = agentDir;

const modeEntry = (mode: string) => ({
  type: 'custom',
  customType: 'ponytail-mode',
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
  ponytailExtension(stub as unknown as ExtensionAPI);

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

const parsed: Array<[string, unknown]> = [
  ['', { kind: 'bare' }],
  ['  ', { kind: 'bare' }],
  ['LITE', { kind: 'set', mode: 'lite' }],
  [' full ', { kind: 'set', mode: 'full' }],
  ['ULTRA', { kind: 'set', mode: 'ultra' }],
  ['off', { kind: 'set', mode: 'off' }],
  ['status', { kind: 'status' }],
  ['review', { kind: 'invalid', arg: 'review' }],
  ['full extra', { kind: 'invalid', arg: 'full extra' }],
];
for (const [raw, expected] of parsed)
  assert.deepEqual(parseCommand(raw), expected);

const branches: Array<[unknown, unknown]> = [
  [undefined, 'full'],
  [[], 'full'],
  [[modeEntry('off')], 'off'],
  [[modeEntry('lite'), modeEntry('ultra')], 'ultra'],
  [
    [{ type: 'custom', customType: 'caveman-mode', data: { mode: 'off' } }],
    'full',
  ],
  [[{ type: 'custom', customType: 'ponytail-mode', data: { mode: 'review' } }], 'full'],
  [[{ type: 'custom', customType: 'ponytail-mode' }], 'full'],
];
for (const [entries, expected] of branches)
  assert.equal(
    resolveMode(entries as Parameters<typeof resolveMode>[0]),
    expected,
  );

assert.match(promptSection('lite', 'BODY'), /PONYTAIL MODE LITE/);
assert.match(promptSection('lite', 'BODY'), /Follow the lite level/);
assert.match(promptSection('lite', 'BODY'), /BODY/);
assert.match(promptSection('off', 'BODY'), /PONYTAIL MODE OFF/);
assert.doesNotMatch(promptSection('off', 'BODY'), /BODY/);

const skillDir = tempDir('skill');
const skill = join(skillDir, 'SKILL.md');
writeFileSync(
  skill,
  '---\nname: ponytail\ndescription: >\n  folded\n---\n\n# Ponytail\n\nRULE LINE\n',
);
assert.equal(loadSkill([skill]), '# Ponytail\n\nRULE LINE');
assert.equal(
  loadSkill([join(skillDir, 'missing.md'), skill]),
  '# Ponytail\n\nRULE LINE',
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
assert.deepEqual(skillCandidates('/agent', '/agent/extensions/ponytail'), [
  '/agent/skills/ponytail/SKILL.md',
  '/agent/skills/ponytail/SKILL.md',
]);

{
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
    () => ponytailExtension(stub as unknown as ExtensionAPI),
    /not found or empty[\s\S]*SKILL\.md/,
  );
  assert.equal(registered, false, 'nothing registered without rules');
  process.env.PI_CODING_AGENT_DIR = previous;
}

{
  const h = harness();
  await h.sessionStart();
  assert.equal(h.status(), '🐴 ponytail: FULL');
  const on = await h.prompt();
  assert.match(on.ponytail, /PONYTAIL MODE FULL/);
  assert.match(on.ponytail, /SENTINEL-PONYTAIL-RULE/);
  assert.doesNotMatch(on.ponytail, /name: ponytail/);

  await h.command('');
  assert.equal(h.message(), 'ponytail: FULL');
  assert.equal(h.entries.length, 0, 'a bare /ponytail reports when already on');

  await h.command('lite');
  assert.equal(h.status(), '🐴 ponytail: LITE');
  assert.deepEqual(h.entries, [
    { customType: 'ponytail-mode', data: { mode: 'lite' } },
  ]);
  const lite = await h.prompt({ ponytail: on.ponytail, caveman: 'CAVE' });
  assert.match(lite.ponytail, /PONYTAIL MODE LITE/);
  assert.match(lite.ponytail, /Follow the lite level/);
  assert.match(lite.ponytail, /SENTINEL-PONYTAIL-RULE/);
  assert.equal(lite.caveman, 'CAVE', 'other sections are untouched');

  await h.command('lite');
  assert.equal(h.entries.length, 1, 'a repeated level appends nothing');
  await h.command('status');
  assert.equal(h.message(), 'ponytail: LITE');
  assert.equal(h.entries.length, 1, '/ponytail status persists nothing');
  await h.command('review');
  assert.match(h.message()!, /Unknown \/ponytail argument: review/);
  assert.equal(h.entries.length, 1, 'an unknown argument changes no state');
  assert.equal(h.status(), '🐴 ponytail: LITE');

  await h.command('off');
  assert.equal(h.status(), '🐴 ponytail: OFF');
  const off = await h.prompt();
  assert.match(off.ponytail, /PONYTAIL MODE OFF/);
  assert.match(off.ponytail, /Ignore every Ponytail instruction/);
  assert.doesNotMatch(off.ponytail, /SENTINEL-PONYTAIL-RULE/);

  h.setIdle(false);
  await h.command('ultra');
  assert.equal(h.status(), '🐴 ponytail: ULTRA');
  assert.match(h.message()!, /applies to the next agent run/);
  h.setIdle(true);
  await h.command('off');
  assert.equal(h.message(), 'ponytail: OFF', 'an idle command has no suffix');
  await h.command('');
  assert.equal(h.status(), '🐴 ponytail: FULL', 'a bare /ponytail turns off back on');
  assert.equal(h.message(), 'ponytail: FULL');
}

{
  const h = harness();
  await h.sessionStart('reload', [modeEntry('ultra')]);
  assert.equal(h.status(), '🐴 ponytail: ULTRA', 'reload keeps the saved level');
  const ultra = await h.prompt();
  assert.match(ultra.ponytail, /PONYTAIL MODE ULTRA/);
  assert.match(ultra.ponytail, /SENTINEL-PONYTAIL-RULE/);
}

{
  const h = harness();
  await h.sessionStart('startup', [modeEntry('full')]);
  await h.treeSwitch([modeEntry('off')]);
  assert.equal(h.status(), '🐴 ponytail: OFF', 'a tree switch restores the branch');
  await h.treeSwitch([modeEntry('lite')]);
  assert.equal(h.status(), '🐴 ponytail: LITE');
}

{
  const h = harness(false);
  await h.sessionStart();
  await h.prompt();
  await h.command('off');
  await h.command('status');
  assert.deepEqual(h.statuses, [], 'a no-UI context never calls setStatus');
}

console.log('ponytail extension: all checks passed');
