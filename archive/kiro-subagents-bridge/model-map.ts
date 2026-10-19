import { isKiroAcpCompatible } from './kiro-compat.ts';
import type { KiroAgentJson } from './kiro-parse.ts';

// shortcut: fallback model IDs are copied; update this set when the provider catalog changes.
const KIRO_ACP_IDS = new Set([
  'auto',
  'claude-opus-5.5',
  'claude-opus-5',
  'claude-sonnet-5.5',
  'claude-sonnet-5',
  'claude-opus-4.8',
  'gpt-5.6-terra',
  'gpt-5.6-luna',
  'claude-sonnet-4.6',
  'claude-haiku-4.5',
  'deepseek-3.2',
  'minimax-m2.5',
  'minimax-m2.1',
  'glm-5',
  'qwen3-coder-next',
]);

/**
 * Map bare Kiro model ids to pi kiro-acp provider when the agent can run through kiro-acp.
 * MCP-native agents omit model (Pi default provider) — kiro-acp only exposes Pi-bridged tools.
 */
export function mapKiroModel(
  agent: KiroAgentJson,
  model: string | undefined,
): string | undefined {
  if (!isKiroAcpCompatible(agent)) return undefined;
  if (!model?.trim()) return undefined;
  const trimmed = model.trim();
  if (trimmed.includes('/')) return trimmed;
  if (KIRO_ACP_IDS.has(trimmed)) return `kiro-acp/${trimmed}`;
  return trimmed;
}
