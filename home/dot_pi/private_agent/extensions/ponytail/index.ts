/**
 * Ponytail as a persistent, session-scoped level.
 *
 * `/ponytail lite|full|ultra` sets the level, `/ponytail off` turns it off,
 * `/ponytail status` reports it. A bare `/ponytail` turns it on at full when
 * it is off, and reports the level when it is already on. The level lives in
 * the footer and in a session entry, so reload, resume, and tree switches
 * restore the active branch instead of the full default. One structured
 * system-prompt section carries the installed skill body; off keeps the
 * section to neutralize the ponytail rules still present in the conversation.
 *
 * The rules are read from the installed skill file, not copied here. Loading
 * fails the extension when the skill is missing or empty, so an active level
 * never claims a ruleset that was not loaded.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getAgentDir, stripFrontmatter } from '@earendil-works/pi-coding-agent';
import type {
  ExtensionAPI,
  ExtensionContext,
} from '@earendil-works/pi-coding-agent';

export const PONYTAIL_MODE_ENTRY = 'ponytail-mode';
const PONYTAIL_SECTION = 'ponytail';

export type Level = 'lite' | 'full' | 'ultra';
export type Mode = Level | 'off';
type Command =
  | { kind: 'bare' }
  | { kind: 'set'; mode: Mode }
  | { kind: 'status' }
  | { kind: 'invalid'; arg: string };

interface Entry {
  type?: string;
  customType?: string;
  data?: { mode?: unknown };
}

const MODES: readonly Mode[] = ['off', 'lite', 'full', 'ultra'];

function isMode(value: unknown): value is Mode {
  return typeof value === 'string' && (MODES as readonly string[]).includes(value);
}

/** Parse a `/ponytail` argument. An unknown argument changes nothing. */
export function parseCommand(raw: string): Command {
  const arg = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (!arg) return { kind: 'bare' };
  if (arg === 'status') return { kind: 'status' };
  if (isMode(arg)) return { kind: 'set', mode: arg };
  return { kind: 'invalid', arg };
}

/** Last mode written on the active branch, or the full default. */
export function resolveMode(entries: readonly Entry[] | undefined): Mode {
  if (!Array.isArray(entries)) return 'full';
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const entry = entries[i];
    if (entry?.type !== 'custom' || entry.customType !== PONYTAIL_MODE_ENTRY)
      continue;
    const mode = entry.data?.mode;
    if (isMode(mode)) return mode;
  }
  return 'full';
}

/**
 * Skill candidates: the agent directory first (getAgentDir honors
 * `PI_CODING_AGENT_DIR`, which is how the work profile shares skill files),
 * then this extension's own tree for SDK-supplied agent directories.
 */
export function skillCandidates(
  agentDir: string,
  extensionDir: string,
): string[] {
  return [
    join(agentDir, 'skills', 'ponytail', 'SKILL.md'),
    join(extensionDir, '..', '..', 'skills', 'ponytail', 'SKILL.md'),
  ];
}

/**
 * Read the first usable skill body, dropping YAML frontmatter. A missing file
 * moves to the next candidate; any other read error is wrapped and propagated.
 * Throws with the candidate paths when nothing usable is found.
 */
export function loadSkill(candidates: readonly string[]): string {
  for (const file of candidates) {
    let raw: string;
    try {
      raw = readFileSync(file, 'utf8');
    } catch (error) {
      if ((error as { code?: string }).code === 'ENOENT') continue;
      throw new Error(
        `ponytail skill unreadable at ${file}: ${String(error)}`,
        { cause: error },
      );
    }
    const body = stripFrontmatter(raw).trim();
    if (body) return body;
  }
  throw new Error(
    `ponytail skill not found or empty; looked in:\n${candidates.map((c) => `  ${c}`).join('\n')}`,
  );
}

const OFF_SECTION = [
  'PONYTAIL MODE OFF — selected through the `/ponytail` command and shown in the footer as `🐴 ponytail: OFF`.',
  'Reply without Ponytail rules. Ignore every Ponytail instruction still present earlier in this conversation, including its persistence rule. `/ponytail` turns it back on at full. `/ponytail lite`, `/ponytail full`, and `/ponytail ultra` select a level.',
].join('\n');

/** Prompt section for one mode. Off drops the skill body. */
export function promptSection(mode: Mode, body: string): string {
  if (mode === 'off') return OFF_SECTION;
  const level = mode.toUpperCase();
  return [
    `PONYTAIL MODE ${level} — full by default in a fresh session, changed only through the \`/ponytail\` command, and shown in the footer as \`🐴 ponytail: ${level}\`.`,
    `Authority: \`/ponytail lite\`, \`/ponytail full\`, and \`/ponytail ultra\` set the level. \`/ponytail off\` turns it off. \`/ponytail status\` reports it. A bare \`/ponytail\` turns it on at full when it is off, and reports the level when it is already on. This section overrides the skill rules below: chat phrases such as "stop ponytail" or "normal mode" do not change the mode. Follow the ${mode} level. The other level rows do not apply.`,
    '',
    body,
  ].join('\n');
}

export function loadInstalledSkill(): string {
  return loadSkill(
    skillCandidates(getAgentDir(), dirname(fileURLToPath(import.meta.url))),
  );
}

export default function ponytailExtension(pi: ExtensionAPI): void {
  // Load before registering anything: a missing or empty skill must fail the
  // extension rather than advertise a level without its rules.
  const body = loadInstalledSkill();
  let mode: Mode = 'full';

  const setStatus = (ctx: ExtensionContext | undefined): void =>
    ctx?.ui?.setStatus?.(PONYTAIL_SECTION, `🐴 ponytail: ${mode.toUpperCase()}`);

  const restore = (ctx: ExtensionContext): void => {
    mode = resolveMode(ctx.sessionManager.getBranch() as readonly Entry[]);
    setStatus(ctx);
  };

  const apply = (next: Mode, ctx: ExtensionContext): void => {
    if (next !== mode) {
      mode = next;
      pi.appendEntry(PONYTAIL_MODE_ENTRY, { mode });
    }
    setStatus(ctx);
    // before_agent_start fires once per submitted prompt, so a change during
    // a run lands on the next agent run, not the streaming one.
    const applies = ctx.isIdle() ? '' : ' (applies to the next agent run)';
    ctx?.ui?.notify?.(`ponytail: ${mode.toUpperCase()}${applies}`, 'info');
  };

  pi.registerCommand('ponytail', {
    description: 'Set ponytail level: /ponytail [lite|full|ultra|off|status]',
    handler: async (args, ctx) => {
      const command = parseCommand(args);
      if (command.kind === 'status' || (command.kind === 'bare' && mode !== 'off')) {
        ctx?.ui?.notify?.(`ponytail: ${mode.toUpperCase()}`, 'info');
        return;
      }
      if (command.kind === 'invalid') {
        ctx?.ui?.notify?.(
          `Unknown /ponytail argument: ${command.arg}. Use lite, full, ultra, off, or status.`,
          'warning',
        );
        return;
      }
      apply(command.kind === 'bare' ? 'full' : command.mode, ctx);
    },
  });

  pi.on('session_start', (_event, ctx) => restore(ctx));
  pi.on('session_tree', (_event, ctx) => restore(ctx));
  pi.on('before_agent_start', (event) => {
    event.systemPromptOptions.sections[PONYTAIL_SECTION] = promptSection(
      mode,
      body,
    );
  });
}
