import type { KiroAgentJson } from "./kiro-parse.ts";

/** Agent declares Kiro-native MCP servers (not available in pi-subagents child). */
export function requiresKiroMcp(agent: KiroAgentJson): boolean {
	return !!agent.mcpServers && Object.keys(agent.mcpServers).length > 0;
}

/** Only agents without Kiro MCP blocks should use kiro-acp provider in Pi subagents. */
export function isKiroAcpCompatible(agent: KiroAgentJson): boolean {
	return !requiresKiroMcp(agent);
}

export function kiroMcpWarning(agent: KiroAgentJson): string | null {
	if (!requiresKiroMcp(agent)) return null;
	const servers = Object.keys(agent.mcpServers ?? {}).join(", ");
	const kiroTools =
		agent.tools?.filter((t) => t.trim().startsWith("@") && t.trim() !== "@builtin") ?? [];
	return [
		"> **Pi subagent limitation:** This Kiro agent depends on MCP server(s):",
		`> \`${servers}\`${kiroTools.length ? ` and tools \`${kiroTools.slice(0, 5).join("`, `")}\`` : ""}.`,
		"> Pi subagents do **not** wire Kiro \`mcpServers\` automatically.",
		"> Use **native Kiro CLI** for full behavior, or configure equivalent MCP in Pi (\`pi-mcp-adapter\`).",
		"> Model uses Pi default provider (not \`kiro-acp\`) to avoid Kiro ACP internal errors.",
		"",
	].join("\n");
}
