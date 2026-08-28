import { KIRO_MODELS } from "../kiro-acp/models/fallback.ts";

import type { KiroAgentJson } from "./kiro-parse.ts";
import { isKiroAcpCompatible } from "./kiro-compat.ts";

const KIRO_ACP_IDS = new Set(KIRO_MODELS.map((m) => m.id));

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
	if (trimmed.includes("/")) return trimmed;
	if (KIRO_ACP_IDS.has(trimmed)) return `kiro-acp/${trimmed}`;
	return trimmed;
}
