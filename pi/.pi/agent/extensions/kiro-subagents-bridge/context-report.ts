import * as fs from "node:fs";
import * as path from "node:path";

import { requiresKiroMcp } from "./kiro-compat.ts";
import type { KiroAgentJson } from "./kiro-parse.ts";
import { readKiroAgentsFromDir } from "./kiro-parse.ts";
import { mapKiroModel } from "./model-map.ts";
import { expandResourceGlob, resolveFileUri } from "./map-to-pi.ts";
import {
	findNearestKiroRoot,
	getGlobalKiroAgentsDir,
	getKiroGlobalOutDir,
	getKiroRepoOutDir,
	getProjectKiroAgentsDir,
} from "./paths.ts";

const MAX_RESOURCE_BYTES = 120_000;

function readTextFile(filePath: string, maxBytes: number): string | null {
	try {
		const stat = fs.statSync(filePath);
		if (!stat.isFile() || stat.size > maxBytes) return null;
		return fs.readFileSync(filePath, "utf-8");
	} catch {
		return null;
	}
}

function mapKiroToolsSummary(agent: KiroAgentJson): string[] {
	const mcpOnly = requiresKiroMcp(agent);
	if (mcpOnly) return ["read", "grep", "find", "ls (MCP tools not wired in Pi)"];
	if (!agent.tools?.length) return ["read, write, grep, find, ls, bash (defaults)"];
	return agent.tools;
}

export interface ResourceLine {
	uri: string;
	status: "loaded" | "skipped" | "empty";
	files: string[];
	bytes: number;
	reason?: string;
}

export interface AgentContextReport {
	name: string;
	runtimeName: string;
	scope: "global" | "project";
	sourcePath: string;
	syncedMdPath: string | null;
	syncedMdBytes: number | null;
	kiroModel?: string;
	piModel?: string;
	toolsKiro: string[];
	mcpServers: string[];
	mcpOnly: boolean;
	prompt: {
		uri?: string;
		resolved?: string;
		status: "loaded" | "missing" | "none";
		chars: number;
	};
	resources: ResourceLine[];
	bakedResourcesBytes: number;
	onSpawn: {
		systemPromptMode: "replace";
		inheritProjectContext: true;
		inheritSkills: false;
		alsoGets: string;
	};
	limitations: string[];
}

export interface KiroContextSessionReport {
	cwd: string;
	kiroRoot: string | null;
	globalAgentsDir: string;
	projectAgentsDir: string | null;
	syncedGlobalDir: string;
	syncedProjectDir: string;
	visibleAgents: AgentContextReport[];
}

function analyzePrompt(
	agent: KiroAgentJson,
	jsonDir: string,
	kiroRoot: string | null,
): AgentContextReport["prompt"] {
	if (!agent.prompt) return { status: "none", chars: 0 };
	const resolved = resolveFileUri(agent.prompt, jsonDir, kiroRoot);
	if (!resolved) return { uri: agent.prompt, status: "missing", chars: 0 };
	const text = readTextFile(resolved, 500_000);
	if (!text) return { uri: agent.prompt, resolved, status: "missing", chars: 0 };
	return { uri: agent.prompt, resolved, status: "loaded", chars: text.length };
}

function analyzeResources(
	agent: KiroAgentJson,
	jsonDir: string,
	kiroRoot: string | null,
): { lines: ResourceLine[]; bakedBytes: number } {
	const lines: ResourceLine[] = [];
	let bakedBytes = 0;
	if (!agent.resources?.length) return { lines, bakedBytes };

	for (const resource of agent.resources) {
		if (resource.startsWith("skill://")) {
			lines.push({
				uri: resource,
				status: "skipped",
				files: [],
				bytes: 0,
				reason: "skill:// not expanded in Pi bridge (use native Kiro CLI)",
			});
			continue;
		}
		const files = expandResourceGlob(resource, jsonDir, kiroRoot);
		if (files.length === 0) {
			lines.push({
				uri: resource,
				status: "empty",
				files: [],
				bytes: 0,
				reason: "no files matched at sync time",
			});
			continue;
		}
		let bytes = 0;
		const loaded: string[] = [];
		for (const file of files) {
			if (bakedBytes >= MAX_RESOURCE_BYTES) break;
			const text = readTextFile(file, MAX_RESOURCE_BYTES - bakedBytes);
			if (!text) continue;
			bytes += text.length;
			bakedBytes += text.length;
			loaded.push(file);
		}
		lines.push({
			uri: resource,
			status: loaded.length > 0 ? "loaded" : "empty",
			files: loaded,
			bytes,
			reason: bakedBytes >= MAX_RESOURCE_BYTES ? `cap ${MAX_RESOURCE_BYTES} bytes total` : undefined,
		});
	}
	return { lines, bakedBytes };
}

function buildAgentReport(
	agent: KiroAgentJson,
	sourcePath: string,
	scope: "global" | "project",
	kiroRoot: string | null,
): AgentContextReport {
	const jsonDir = path.dirname(sourcePath);
	const name = agent.name.trim();
	const syncedDir =
		scope === "global" ? getKiroGlobalOutDir() : kiroRoot ? getKiroRepoOutDir(kiroRoot) : null;
	const syncedMdPath = syncedDir ? path.join(syncedDir, `${name}.md`) : null;
	let syncedMdBytes: number | null = null;
	if (syncedMdPath && fs.existsSync(syncedMdPath)) {
		try {
			syncedMdBytes = fs.statSync(syncedMdPath).size;
		} catch {
			syncedMdBytes = null;
		}
	}

	const prompt = analyzePrompt(agent, jsonDir, kiroRoot);
	const { lines: resources, bakedBytes: bakedResourcesBytes } = analyzeResources(agent, jsonDir, kiroRoot);

	const limitations: string[] = [];
	if (requiresKiroMcp(agent)) {
		limitations.push("Kiro mcpServers are not wired in Pi subagents — MCP tools from JSON will not run");
	}
	if (agent.resources?.some((r) => r.startsWith("skill://"))) {
		limitations.push("skill:// resources are not inlined into synced markdown");
	}
	if (bakedResourcesBytes >= MAX_RESOURCE_BYTES) {
		limitations.push(`resource body capped at ${MAX_RESOURCE_BYTES} bytes in synced markdown`);
	}

	return {
		name,
		runtimeName: `kiro.${name}`,
		scope,
		sourcePath,
		syncedMdPath: fs.existsSync(syncedMdPath) ? syncedMdPath : null,
		syncedMdBytes,
		kiroModel: agent.model,
		piModel: mapKiroModel(agent, agent.model),
		toolsKiro: mapKiroToolsSummary(agent),
		mcpServers: Object.keys(agent.mcpServers ?? {}),
		mcpOnly: requiresKiroMcp(agent),
		prompt,
		resources,
		bakedResourcesBytes,
		onSpawn: {
			systemPromptMode: "replace",
			inheritProjectContext: true,
			inheritSkills: false,
			alsoGets: "Pi project context (AGENTS.md / CLAUDE.md chain from session cwd)",
		},
		limitations,
	};
}

function buildGlobalAgentsToWrite(
	global: Map<string, { config: KiroAgentJson; sourcePath: string }>,
	project: Map<string, { config: KiroAgentJson; sourcePath: string }>,
): Map<string, { config: KiroAgentJson; sourcePath: string }> {
	const out = new Map<string, { config: KiroAgentJson; sourcePath: string }>();
	for (const [name, entry] of global) {
		if (!project.has(name)) out.set(name, entry);
	}
	return out;
}

export function gatherKiroContextForCwd(cwd: string, filterName?: string): KiroContextSessionReport {
	const kiroRoot = findNearestKiroRoot(cwd);
	const globalDir = getGlobalKiroAgentsDir();
	const projectDir = kiroRoot ? getProjectKiroAgentsDir(kiroRoot) : null;

	const globalAgents = readKiroAgentsFromDir(globalDir);
	const projectAgents = projectDir ? readKiroAgentsFromDir(projectDir) : new Map();
	const globalToWrite = buildGlobalAgentsToWrite(globalAgents, projectAgents);

	const visibleAgents: AgentContextReport[] = [];

	for (const [, { config, sourcePath }] of globalToWrite) {
		if (filterName && config.name.trim() !== filterName) continue;
		visibleAgents.push(buildAgentReport(config, sourcePath, "global", null));
	}
	for (const [, { config, sourcePath }] of projectAgents) {
		if (filterName && config.name.trim() !== filterName) continue;
		visibleAgents.push(buildAgentReport(config, sourcePath, "project", kiroRoot));
	}

	visibleAgents.sort((a, b) => a.runtimeName.localeCompare(b.runtimeName));
	return {
		cwd,
		kiroRoot,
		globalAgentsDir: globalDir,
		projectAgentsDir: projectDir,
		syncedGlobalDir: getKiroGlobalOutDir(),
		syncedProjectDir: kiroRoot ? getKiroRepoOutDir(kiroRoot) : null,
		visibleAgents,
	};
}

function formatBytes(n: number): string {
	if (n < 1024) return `${n} B`;
	if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
	return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatAgentReport(a: AgentContextReport): string[] {
	const lines: string[] = [];
	lines.push(`## ${a.runtimeName} (${a.scope})`);
	lines.push(`Source: ${a.sourcePath}`);
	if (a.syncedMdPath) {
		lines.push(`Synced: ${a.syncedMdPath}${a.syncedMdBytes != null ? ` (${formatBytes(a.syncedMdBytes)})` : ""}`);
	} else {
		lines.push("Synced: (not written yet — run session or wait for sync)");
	}

	const modelPart = a.piModel
		? `Kiro \`${a.kiroModel ?? "?"}\` → Pi \`${a.piModel}\``
		: a.kiroModel
			? `Kiro \`${a.kiroModel}\` → Pi default provider${a.mcpOnly ? " (MCP agent)" : ""}`
			: "Pi default provider";
	lines.push(`Model: ${modelPart}`);
	lines.push(`Tools (JSON): ${a.toolsKiro.join(", ")}`);
	if (a.mcpServers.length) lines.push(`MCP (Kiro only): ${a.mcpServers.join(", ")}`);

	lines.push("");
	lines.push("### Baked into subagent system prompt (at sync)");
	if (a.prompt.status === "none") {
		lines.push("- Prompt: (none in JSON)");
	} else if (a.prompt.status === "loaded") {
		lines.push(`- Prompt: ${a.prompt.resolved} (~${a.prompt.chars.toLocaleString()} chars)`);
	} else {
		lines.push(`- Prompt: UNRESOLVED ${a.prompt.uri}`);
	}
	if (a.resources.length === 0) {
		lines.push("- Resources: (none)");
	} else {
		lines.push(`- Resources (${formatBytes(a.bakedResourcesBytes)} inlined):`);
		for (const r of a.resources) {
			if (r.status === "loaded") {
				const rel = r.files.map((f) => path.basename(f)).join(", ");
				lines.push(`  - ✓ ${r.uri} → ${r.files.length} file(s), ${formatBytes(r.bytes)}${rel ? ` [${rel}]` : ""}`);
			} else {
				lines.push(`  - ✗ ${r.uri} — ${r.reason ?? r.status}`);
			}
		}
	}

	lines.push("");
	lines.push("### Added when subagent spawns (Pi)");
	lines.push(`- systemPromptMode: ${a.onSpawn.systemPromptMode} (synced markdown replaces base prompt)`);
	lines.push(`- inheritProjectContext: yes — ${a.onSpawn.alsoGets}`);
	lines.push(`- inheritSkills: no`);

	if (a.limitations.length) {
		lines.push("");
		lines.push("### Limitations");
		for (const lim of a.limitations) lines.push(`- ${lim}`);
	}
	if (a.mcpOnly) {
		lines.push("- Native Kiro CLI has full MCP; Pi needs equivalent MCP in mcp.json");
	}

	return lines;
}

export function formatKiroContextReport(report: KiroContextSessionReport): string {
	const lines: string[] = [];
	lines.push("Kiro agent context (what subagents actually see)");
	lines.push("");
	lines.push(`Session cwd: ${report.cwd}`);
	lines.push(`Kiro project root: ${report.kiroRoot ?? "(none — global agents only)"}`);
	lines.push(`JSON: global ${report.globalAgentsDir}${report.projectAgentsDir ? ` · project ${report.projectAgentsDir}` : ""}`);
	lines.push(`Synced: ${report.syncedGlobalDir}/ · ${report.syncedProjectDir}/`);
	lines.push("");
	lines.push(
		"How it works: bridge inlines prompt + file:// resources into kiro-active/global/ and kiro-by-repo/<id>/ at sync.",
	);
	lines.push(
		"When you run `kiro.<name>`, pi-subagents loads that markdown as the system prompt, plus AGENTS.md chain from cwd.",
	);
	lines.push("");

	if (report.visibleAgents.length === 0) {
		lines.push("(no Kiro agents visible for this cwd)");
		return lines.join("\n");
	}

	for (const agent of report.visibleAgents) {
		lines.push(...formatAgentReport(agent));
		lines.push("");
	}

	return lines.join("\n").trimEnd() + "\n";
}
