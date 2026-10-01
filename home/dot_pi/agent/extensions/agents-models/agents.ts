import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import * as path from 'node:path';

import { CONFIG_DIR_NAME, getAgentDir } from '@earendil-works/pi-coding-agent';

import { findProjectRoot, type SubagentSettingsView } from './settings.ts';

export type AgentOrigin = 'builtin' | 'user' | 'project';

export interface DiscoveredAgent {
  readonly name: string;
  readonly origin: AgentOrigin;
  readonly description?: string;
  readonly frontmatterModel?: string;
  readonly disabled: boolean;
}

export interface ModelOrigin {
  readonly source:
    | 'project override'
    | 'user override'
    | 'agent frontmatter'
    | 'subagents.defaultModel'
    | 'parent session';
  readonly model: string;
}

const resolveFromHere = createRequire(import.meta.url);

/** Locates the agents directory shipped by the installed pi-subagents package. */
function builtinAgentsDir(): string | undefined {
  const candidates: string[] = [
    path.join(getAgentDir(), 'npm', 'node_modules', 'pi-subagents', 'agents'),
  ];
  try {
    candidates.push(
      path.join(
        path.dirname(resolveFromHere.resolve('pi-subagents/package.json')),
        'agents',
      ),
    );
  } catch {
    // Package is not resolvable from this extension; the npm path above may still work.
  }
  return candidates.find((dir) => existsSync(dir));
}

function agentDirs(cwd: string): Array<{ dir: string; origin: AgentOrigin }> {
  const dirs: Array<{ dir: string; origin: AgentOrigin }> = [];
  const builtin = builtinAgentsDir();
  if (builtin) dirs.push({ dir: builtin, origin: 'builtin' });
  dirs.push({ dir: path.join(getAgentDir(), 'agents'), origin: 'user' });
  dirs.push({ dir: path.join(homedir(), '.agents'), origin: 'user' });
  const projectRoot = findProjectRoot(cwd);
  if (projectRoot) {
    dirs.push({ dir: path.join(projectRoot, '.agents'), origin: 'project' });
    dirs.push({
      dir: path.join(projectRoot, CONFIG_DIR_NAME, 'agents'),
      origin: 'project',
    });
  }
  return dirs.filter((entry) => existsSync(entry.dir));
}

/** Reads the flat `key: value` frontmatter fields this picker needs. */
function readFrontmatter(filePath: string): Record<string, string> | undefined {
  let text: string;
  try {
    text = readFileSync(filePath, 'utf8');
  } catch {
    return undefined;
  }
  if (!text.startsWith('---')) return undefined;
  const end = text.indexOf('\n---', 3);
  if (end === -1) return undefined;
  const fields: Record<string, string> = {};
  for (const line of text.slice(3, end).split('\n')) {
    const match = /^([A-Za-z][A-Za-z0-9_]*):\s*(.*)$/.exec(line);
    if (!match) continue;
    fields[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
  }
  return fields;
}

function loadAgentsFromDir(
  dir: string,
  origin: AgentOrigin,
): DiscoveredAgent[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  const agents: DiscoveredAgent[] = [];
  for (const entry of entries.sort()) {
    if (!entry.endsWith('.md')) continue;
    const fields = readFrontmatter(path.join(dir, entry));
    if (!fields) continue;
    const name = fields.name ?? entry.slice(0, -3);
    if (!name) continue;
    agents.push({
      name,
      origin,
      description: fields.description,
      frontmatterModel: fields.model,
      disabled: fields.disabled === 'true',
    });
  }
  return agents;
}

/**
 * Reconstructs the subagent roster from the same locations pi-subagents scans.
 * Later sources win, matching its user-over-project-over-builtin precedence.
 */
export function discoverAgents(cwd: string): DiscoveredAgent[] {
  const byName = new Map<string, DiscoveredAgent>();
  for (const { dir, origin } of agentDirs(cwd)) {
    for (const agent of loadAgentsFromDir(dir, origin)) {
      byName.set(agent.name, agent);
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Adds agents that only exist as a settings override, with no definition file. */
/** User and project settings views. */
export type SettingsViews = Readonly<{
  user: SubagentSettingsView | undefined;
  project: SubagentSettingsView | undefined;
}>;

export function withOverrideOnlyAgents(
  agents: DiscoveredAgent[],
  views: SettingsViews,
): DiscoveredAgent[] {
  const known = new Set(agents.map((agent) => agent.name));
  const disabled = new Set<string>();
  const extra: DiscoveredAgent[] = [];
  for (const kind of ['user', 'project'] as const) {
    for (const [name, override] of views[kind]?.overrides ?? []) {
      if (override.disabled) disabled.add(name);
      if (known.has(name)) continue;
      known.add(name);
      extra.push({
        name,
        origin: kind,
        disabled: override.disabled,
      });
    }
  }
  const merged = agents.map((agent) =>
    disabled.has(agent.name) && !agent.disabled
      ? { ...agent, disabled: true }
      : agent,
  );
  return [...merged, ...extra].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Agents the popup may pin: everything pi-subagents would still launch, so
 * `disabled: true` in an agent override hides the agent here too.
 */
export function selectPinnableAgents(agents: readonly DiscoveredAgent[]): {
  readonly pinnable: DiscoveredAgent[];
  readonly hiddenCount: number;
} {
  const pinnable = agents.filter((agent) => !agent.disabled);
  return { pinnable, hiddenCount: agents.length - pinnable.length };
}

/** Mirrors pi-subagents precedence: project override, user override, frontmatter, default, parent. */
export function resolveModelOrigin(
  agent: DiscoveredAgent,
  views: SettingsViews,
  parentModel: string,
): ModelOrigin {
  const project = views.project?.overrides.get(agent.name);
  if (project?.model)
    return { source: 'project override', model: project.model };
  const user = views.user?.overrides.get(agent.name);
  if (user?.model) return { source: 'user override', model: user.model };
  if (agent.frontmatterModel) {
    return { source: 'agent frontmatter', model: agent.frontmatterModel };
  }
  const defaultModel = views.project?.defaultModel ?? views.user?.defaultModel;
  if (defaultModel)
    return { source: 'subagents.defaultModel', model: defaultModel };
  return { source: 'parent session', model: parentModel };
}
