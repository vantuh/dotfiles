#!/usr/bin/env bun
/**
 * Mirror pi-subagents package agents into this dotfiles repo so their prompts
 * live in our source state instead of inside the installed package.
 *
 * Only agents that are not disabled in `.settings.json` are mirrored, so
 * disabled runners (claude-code, codex-exec, cursor-agent, ...) stay on the
 * package default and never freeze into the repo.
 *
 * Layout under the repo:
 *   home/dot_pi/agent/agents/<name>.md                  our editable copy (chezmoi target)
 *   home/dot_pi/agent/subagents-agents-base/<name>.md   pristine package copy of the same version
 *
 * On a package upgrade the pristine copy is the merge base:
 *   local == base  -> fast-forward both files to the new package content
 *   local != base  -> three-way merge of our edits onto the new package content
 *   conflict       -> our file is left untouched, `<name>.conflict.md` is written, exit 1
 *
 * Usage:
 *   subagents-agents-sync [repoRoot]   # defaults to $DOTFILES or ~/dotfiles
 *   subagents-agents-sync --self-test
 */

import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

const PACKAGE_AGENTS = join(
  process.env.HOME ?? '',
  '.pi/agent/npm/node_modules/pi-subagents/agents',
);
const AGENTS_REL = 'home/dot_pi/agent/agents';
const BASE_REL = 'home/dot_pi/agent/subagents-agents-base';
const SETTINGS_REL = 'home/dot_pi/agent/.settings.json';

type SyncResult =
  | 'added'
  | 'updated'
  | 'merged'
  | 'seeded'
  | 'unchanged'
  | 'conflict';

type SyncEntry = { name: string; result: SyncResult; detail?: string };

function readDisabledAgents(settingsPath: string): Set<string> {
  const overrides =
    (JSON.parse(readFileSync(settingsPath, 'utf8')).subagents ?? {})
      .agentOverrides ?? {};
  return new Set(
    Object.entries(overrides as Record<string, { disabled?: boolean }>)
      .filter(([, v]) => v.disabled)
      .map(([name]) => name),
  );
}

/** Three-way merge. `git merge-file` exits non-zero and still prints a conflicted file. */
function merge3(
  local: string,
  base: string,
  theirs: string,
): { merged: string; clean: boolean } {
  const dir = mkdtempSync(join(tmpdir(), 'subagents-merge-'));
  try {
    const ours = join(dir, 'ours');
    const ancestor = join(dir, 'base');
    const updated = join(dir, 'theirs');
    writeFileSync(ours, local);
    writeFileSync(ancestor, base);
    writeFileSync(updated, theirs);
    try {
      const merged = execFileSync(
        'git',
        ['merge-file', '-p', ours, ancestor, updated],
        {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      return { merged, clean: true };
    } catch (error) {
      return {
        merged: String((error as { stdout?: unknown }).stdout ?? ''),
        clean: false,
      };
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function syncAgent(
  agentsDir: string,
  baseDir: string,
  name: string,
  theirs: string,
): SyncEntry {
  const localPath = join(agentsDir, `${name}.md`);
  const basePath = join(baseDir, `${name}.md`);
  const conflictPath = join(agentsDir, `${name}.conflict.md`);
  if (existsSync(conflictPath))
    return {
      name,
      result: 'conflict',
      detail: 'unresolved conflict file present, skipped',
    };

  const local = existsSync(localPath) ? readFileSync(localPath, 'utf8') : null;
  if (local === null) {
    mkdirSync(agentsDir, { recursive: true });
    writeFileSync(localPath, theirs);
    writeFileSync(basePath, theirs);
    return { name, result: 'added' };
  }
  if (local === theirs) return { name, result: 'unchanged' };

  if (!existsSync(basePath)) {
    writeFileSync(basePath, theirs);
    return {
      name,
      result: 'seeded',
      detail:
        'no base recorded; kept our file, merge base armed for next upgrade',
    };
  }

  const base = readFileSync(basePath, 'utf8');
  if (local === base) {
    writeFileSync(localPath, theirs);
    writeFileSync(basePath, theirs);
    return { name, result: 'updated' };
  }
  if (base === theirs)
    return { name, result: 'unchanged', detail: 'package content unchanged' };

  const { merged, clean } = merge3(local, base, theirs);
  if (!clean) {
    writeFileSync(conflictPath, merged);
    return {
      name,
      result: 'conflict',
      detail: `see ${basename(conflictPath)}`,
    };
  }
  writeFileSync(localPath, merged);
  writeFileSync(basePath, theirs);
  return { name, result: 'merged' };
}

function sync(repoRoot: string): number {
  const settingsPath = join(repoRoot, SETTINGS_REL);
  if (!existsSync(settingsPath))
    throw new Error(`not a dotfiles repo: ${settingsPath} missing`);
  if (!existsSync(PACKAGE_AGENTS))
    throw new Error(`pi-subagents package agents not found: ${PACKAGE_AGENTS}`);

  const disabled = readDisabledAgents(settingsPath);
  const agentsDir = join(repoRoot, AGENTS_REL);
  const baseDir = join(repoRoot, BASE_REL);
  mkdirSync(baseDir, { recursive: true });

  const names = packageAgentNames(disabled);
  const entries = names.map((name) =>
    syncAgent(
      agentsDir,
      baseDir,
      name,
      readFileSync(join(PACKAGE_AGENTS, `${name}.md`), 'utf8'),
    ),
  );

  for (const entry of entries) {
    const detail = entry.detail ? ` — ${entry.detail}` : '';
    console.log(`${entry.result.padEnd(9)} ${entry.name}${detail}`);
  }
  const conflicts = entries.filter((entry) => entry.result === 'conflict');
  const changed = entries.filter((entry) => entry.result !== 'unchanged');
  console.log(
    `\n${changed.length} changed, ${conflicts.length} conflict(s). Run \`chezmoi apply\` to install.`,
  );
  return conflicts.length > 0 ? 1 : 0;
}

function packageAgentNames(disabled: Set<string>): string[] {
  return readdirSync(PACKAGE_AGENTS)
    .filter((path) => path.endsWith('.md'))
    .map((path) => path.slice(0, -'.md'.length))
    .filter((name) => !disabled.has(name))
    .sort();
}

function selfTest(): void {
  const root = mkdtempSync(join(tmpdir(), 'subagents-sync-'));
  try {
    const agentsDir = join(root, AGENTS_REL);
    const baseDir = join(root, BASE_REL);
    mkdirSync(baseDir, { recursive: true });
    writeFileSync(
      join(root, SETTINGS_REL),
      JSON.stringify({
        subagents: {
          agentOverrides: { worker: {}, ghost: { disabled: true } },
        },
      }),
    );

    const names = packageAgentNames(new Set(['ghost']));
    if (names.includes('ghost')) throw new Error('disabled agent was mirrored');

    const PACKAGE_V1 = 'l1\nl2\nl3\nl4\nl5\n';
    const PACKAGE_V2 = `${PACKAGE_V1}theirs\n`;

    // added
    if (syncAgent(agentsDir, baseDir, 'worker', PACKAGE_V1).result !== 'added')
      throw new Error('add failed');
    // untouched local fast-forwards to the new package content
    if (syncAgent(agentsDir, baseDir, 'scout', PACKAGE_V1).result !== 'added')
      throw new Error('add failed');
    if (syncAgent(agentsDir, baseDir, 'scout', PACKAGE_V2).result !== 'updated')
      throw new Error('fast-forward failed');
    // local edited, package edits elsewhere -> clean merge
    writeFileSync(join(agentsDir, 'worker.md'), 'l1\nours\nl3\nl4\nl5\n');
    if (syncAgent(agentsDir, baseDir, 'worker', PACKAGE_V2).result !== 'merged')
      throw new Error('merge failed');
    const merged = readFileSync(join(agentsDir, 'worker.md'), 'utf8');
    if (!merged.includes('ours') || !merged.includes('theirs'))
      throw new Error('merge lost content');
    // same-line conflict keeps our file untouched
    const ours = 'l1\nours-only\nl3\nl4\nl5\n';
    writeFileSync(join(agentsDir, 'worker.md'), ours);
    writeFileSync(join(baseDir, 'worker.md'), PACKAGE_V1);
    if (
      syncAgent(agentsDir, baseDir, 'worker', 'l1\ntheirs-only\nl3\nl4\nl5\n')
        .result !== 'conflict'
    )
      throw new Error('conflict not detected');
    if (readFileSync(join(agentsDir, 'worker.md'), 'utf8') !== ours)
      throw new Error('conflict overwrote our file');
    console.log('self-test ok');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

if (process.argv.includes('--self-test')) {
  selfTest();
} else {
  const repoRoot =
    process.argv[2] ??
    process.env.DOTFILES ??
    join(process.env.HOME ?? '', 'dotfiles');
  try {
    process.exit(sync(repoRoot));
  } catch (error) {
    console.error(
      `subagents-agents-sync: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(2);
  }
}
