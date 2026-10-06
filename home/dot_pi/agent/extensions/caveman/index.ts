/**
 * Caveman voice as a persistent, session-scoped mode.
 *
 * `/caveman` toggles, `/caveman on|off` set it, `/caveman status` reports it.
 * The mode lives in the footer and in a session entry, so reload, resume, and
 * tree switches restore the active branch instead of the ON default. One
 * structured system-prompt section carries the installed skill body; OFF keeps
 * the section to neutralize the caveman rules still present in the conversation.
 *
 * The rules are read from the installed skill file, not copied here. Loading
 * fails the extension when the skill is missing or empty, so ON never claims a
 * ruleset that was not loaded.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getAgentDir, stripFrontmatter } from '@earendil-works/pi-coding-agent';
import type {
  ExtensionAPI,
  ExtensionContext,
} from '@earendil-works/pi-coding-agent';

export const CAVEMAN_MODE_ENTRY = 'caveman-mode';
const CAVEMAN_SECTION = 'caveman';

export type Mode = 'on' | 'off';
type Command =
  | { kind: 'toggle' }
  | { kind: 'set'; mode: Mode }
  | { kind: 'status' }
  | { kind: 'invalid'; arg: string };

interface Entry {
  type?: string;
  customType?: string;
  data?: { mode?: unknown };
}

/** Parse a `/caveman` argument. An unknown argument changes nothing. */
export function parseCommand(raw: string): Command {
  const arg = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (!arg) return { kind: 'toggle' };
  if (arg === 'on' || arg === 'off') return { kind: 'set', mode: arg };
  if (arg === 'status') return { kind: 'status' };
  return { kind: 'invalid', arg };
}

/** Last mode written on the active branch, or the ON default. */
export function resolveMode(entries: readonly Entry[] | undefined): Mode {
  if (!Array.isArray(entries)) return 'on';
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const entry = entries[i];
    if (entry?.type !== 'custom' || entry.customType !== CAVEMAN_MODE_ENTRY)
      continue;
    const mode = entry.data?.mode;
    if (mode === 'on' || mode === 'off') return mode;
  }
  return 'on';
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
    join(agentDir, 'skills', 'caveman', 'SKILL.md'),
    join(extensionDir, '..', '..', 'skills', 'caveman', 'SKILL.md'),
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
      throw new Error(`caveman skill unreadable at ${file}: ${String(error)}`, {
        cause: error,
      });
    }
    const body = stripFrontmatter(raw).trim();
    if (body) return body;
  }
  throw new Error(
    `caveman skill not found or empty; looked in:\n${candidates.map((c) => `  ${c}`).join('\n')}`,
  );
}

const ON_AUTHORITY = [
  'CAVEMAN MODE ON — ON by default in a fresh session, changed only through the `/caveman` command, and shown in the footer as `caveman: ON`.',
  'Authority: `/caveman` toggles, `/caveman on` and `/caveman off` set the mode, `/caveman status` reports it. This section overrides the skill rules below: there are no levels or `ultra`/`wenyan` modes, and chat phrases such as "stop caveman" or "normal mode" do not change the mode.',
].join('\n');

const OFF_SECTION = [
  'CAVEMAN MODE OFF — selected through the `/caveman` command and shown in the footer as `caveman: OFF`.',
  'Reply in normal, complete prose. Ignore every Caveman instruction still present earlier in this conversation, including its persistence rule. `/caveman` toggles, and `/caveman on` turns it back on.',
].join('\n');

export default function cavemanExtension(pi: ExtensionAPI): void {
  // Load before registering anything: a missing or empty skill must fail the
  // extension rather than advertise an ON mode without its rules.
  const body = loadSkill(
    skillCandidates(getAgentDir(), dirname(fileURLToPath(import.meta.url))),
  );
  let mode: Mode = 'on';

  const setStatus = (ctx: ExtensionContext | undefined): void =>
    ctx?.ui?.setStatus?.(
      CAVEMAN_SECTION,
      mode === 'on' ? 'caveman: ON' : 'caveman: OFF',
    );

  const restore = (ctx: ExtensionContext): void => {
    mode = resolveMode(ctx.sessionManager.getBranch() as readonly Entry[]);
    setStatus(ctx);
  };

  pi.registerCommand('caveman', {
    description: 'Toggle caveman voice: /caveman [on|off|status]',
    handler: async (args, ctx) => {
      const command = parseCommand(args);
      if (command.kind === 'status') {
        ctx?.ui?.notify?.(`caveman: ${mode.toUpperCase()}`, 'info');
        return;
      }
      if (command.kind === 'invalid') {
        ctx?.ui?.notify?.(
          `Unknown /caveman argument: ${command.arg}. Use on, off, or status.`,
          'warning',
        );
        return;
      }
      const next =
        command.kind === 'toggle'
          ? mode === 'on'
            ? 'off'
            : 'on'
          : command.mode;
      if (next !== mode) {
        mode = next;
        pi.appendEntry(CAVEMAN_MODE_ENTRY, { mode });
      }
      setStatus(ctx);
      // before_agent_start fires once per submitted prompt, so a change during
      // a run lands on the next agent run, not the streaming one.
      const applies = ctx.isIdle() ? '' : ' (applies to the next agent run)';
      ctx?.ui?.notify?.(`caveman: ${mode.toUpperCase()}${applies}`, 'info');
    },
  });

  pi.on('session_start', (_event, ctx) => restore(ctx));
  pi.on('session_tree', (_event, ctx) => restore(ctx));
  pi.on('before_agent_start', (event) => {
    // Own section only; `ponytail` and any other section are left untouched.
    event.systemPromptOptions.sections[CAVEMAN_SECTION] =
      mode === 'on' ? `${ON_AUTHORITY}\n\n${body}` : OFF_SECTION;
  });
}
