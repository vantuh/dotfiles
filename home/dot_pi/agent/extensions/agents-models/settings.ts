import {
  existsSync,
  readFileSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import * as path from 'node:path';

import { CONFIG_DIR_NAME, getAgentDir } from '@earendil-works/pi-coding-agent';

export type SettingsScopeKind = 'user' | 'project';

export interface SettingsScope {
  readonly kind: SettingsScopeKind;
  /** Absolute path of the settings.json that will be written. */
  readonly path: string;
  /** Tab label: `global` or `local`. */
  readonly label: string;
}

export interface AgentOverrideView {
  readonly model?: string;
  readonly disabled: boolean;
}

export interface SubagentSettingsView {
  readonly defaultModel?: string;
  readonly overrides: ReadonlyMap<string, AgentOverrideView>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readJsonObject(filePath: string): Record<string, unknown> {
  if (!existsSync(filePath)) return {};
  try {
    const parsed: unknown = JSON.parse(readFileSync(filePath, 'utf8'));
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function readSubagentSettings(filePath: string): SubagentSettingsView {
  const subagents = readJsonObject(filePath).subagents;
  if (!isRecord(subagents)) return { overrides: new Map() };

  const overrides = new Map<string, AgentOverrideView>();
  if (isRecord(subagents.agentOverrides)) {
    for (const [name, value] of Object.entries(subagents.agentOverrides)) {
      if (!isRecord(value)) continue;
      overrides.set(name, {
        model: typeof value.model === 'string' ? value.model : undefined,
        disabled: value.disabled === true,
      });
    }
  }

  return {
    defaultModel:
      typeof subagents.defaultModel === 'string'
        ? subagents.defaultModel
        : undefined,
    overrides,
  };
}

/**
 * Walks up from `cwd` to the nearest directory that looks like a pi project
 * root. `$HOME/.pi` is pi's own config root, not a project: treating it as one
 * would make "local" resolve to the global settings file.
 */
export function findProjectRoot(cwd: string): string | undefined {
  const configRoot = path.resolve(path.dirname(getAgentDir()));
  let current = path.resolve(cwd);
  for (;;) {
    const isConfigRoot = path.resolve(current, CONFIG_DIR_NAME) === configRoot;
    if (
      !isConfigRoot &&
      (existsSync(path.join(current, CONFIG_DIR_NAME)) ||
        existsSync(path.join(current, '.agents')))
    ) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

export function userSettingsScope(): SettingsScope {
  return {
    kind: 'user',
    path: path.join(getAgentDir(), 'settings.json'),
    label: 'global',
  };
}

export function projectSettingsScope(cwd: string): SettingsScope | undefined {
  const root = findProjectRoot(cwd);
  if (!root) return undefined;
  return {
    kind: 'project',
    path: path.join(root, CONFIG_DIR_NAME, 'settings.json'),
    label: 'local',
  };
}

export function readSubagentSettingsForScope(
  scope: SettingsScope,
): SubagentSettingsView {
  return readSubagentSettings(scope.path);
}

/**
 * Sets or removes `subagents.agentOverrides.<agent>.model` in the scope's settings.json.
 * `null` removes the override; an override object left empty is removed as well.
 */
export function writeAgentModelOverride(
  scope: SettingsScope,
  agent: string,
  model: string | null,
): void {
  const filePath = scope.path;
  const original = existsSync(filePath)
    ? readFileSync(filePath, 'utf8')
    : '{}\n';
  const parsed = parseOrThrow(original, filePath);
  const root = isRecord(parsed) ? parsed : {};

  const subagents = isRecord(root.subagents) ? root.subagents : {};
  const agentOverrides = isRecord(subagents.agentOverrides)
    ? subagents.agentOverrides
    : {};
  const existing = isRecord(agentOverrides[agent]) ? agentOverrides[agent] : {};

  if (model === null) {
    delete existing.model;
    if (Object.keys(existing).length === 0) {
      delete agentOverrides[agent];
    } else {
      agentOverrides[agent] = existing;
    }
  } else {
    agentOverrides[agent] = { ...existing, model };
  }

  subagents.agentOverrides = agentOverrides;
  root.subagents = subagents;

  writeJsonAtomically(filePath, `${JSON.stringify(root, null, 2)}\n`);
}

function parseOrThrow(text: string, filePath: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${filePath} is not valid JSON: ${message}`);
  }
}

function writeJsonAtomically(filePath: string, contents: string): void {
  // The target can be a dest-symlink into this repo (chezmoi links
  // ~/.pi/agent/settings.json), and rename() would replace the link itself, so
  // resolve it first and swap the real file in place.
  const targetPath = existsSync(filePath) ? realpathSync(filePath) : filePath;
  const tempPath = `${targetPath}.agents-models.tmp`;
  writeFileSync(tempPath, contents, 'utf8');
  renameSync(tempPath, targetPath);
}
