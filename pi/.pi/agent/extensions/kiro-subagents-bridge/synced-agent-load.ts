import * as fs from "node:fs";
import * as path from "node:path";

import { log } from "./logging.ts";

/** Minimal AgentConfig shape used by pi-subagents discovery merge. */
export interface SyncedKiroAgent {
	name: string;
	localName: string;
	packageName: string;
	description: string;
	tools?: string[];
	model?: string;
	systemPromptMode: "replace" | "append";
	inheritProjectContext: boolean;
	inheritSkills: boolean;
	systemPrompt: string;
	source: "project";
	filePath: string;
}

function parseFrontmatter(content: string): { frontmatter: Record<string, string>; body: string } {
	const frontmatter: Record<string, string> = {};
	const normalized = content.replace(/\r\n/g, "\n");
	if (!normalized.startsWith("---")) return { frontmatter, body: normalized };
	const endIndex = normalized.indexOf("\n---", 3);
	if (endIndex === -1) return { frontmatter, body: normalized };
	const frontmatterBlock = normalized.slice(4, endIndex);
	const body = normalized.slice(endIndex + 4).trim();
	for (const line of frontmatterBlock.split("\n")) {
		const match = line.match(/^([\w-]+):\s*(.*)$/);
		if (!match) continue;
		let value = match[2].trim();
		if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
			value = value.slice(1, -1);
		}
		frontmatter[match[1]] = value;
	}
	return { frontmatter, body };
}

function listMarkdownFiles(dir: string): string[] {
	if (!fs.existsSync(dir)) return [];
	const files: string[] = [];
	const walk = (current: string) => {
		let entries: fs.Dirent[];
		try {
			entries = fs.readdirSync(current, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			const full = path.join(current, entry.name);
			if (entry.isDirectory()) {
				walk(full);
				continue;
			}
			if (entry.isFile() && entry.name.endsWith(".md") && !entry.name.endsWith(".chain.md")) {
				files.push(full);
			}
		}
	};
	walk(dir);
	return files.sort();
}

/** Load synced Kiro markdown from a per-repo cache dir (outside ~/.pi/agent/agents/). */
export function loadSyncedKiroAgentsFromDir(dir: string): SyncedKiroAgent[] {
	const agents: SyncedKiroAgent[] = [];
	for (const filePath of listMarkdownFiles(dir)) {
		let content: string;
		try {
			content = fs.readFileSync(filePath, "utf-8");
		} catch {
			continue;
		}
		const { frontmatter, body } = parseFrontmatter(content);
		if (!frontmatter.name || !frontmatter.description) continue;
		const localName = frontmatter.name.trim();
		const packageName = frontmatter.package?.trim() || "kiro";
		const runtimeName = packageName ? `${packageName}.${localName}` : localName;
		const tools = frontmatter.tools
			?.split(",")
			.map((t) => t.trim())
			.filter(Boolean);
		agents.push({
			name: runtimeName,
			localName,
			packageName,
			description: frontmatter.description,
			tools: tools?.length ? tools : undefined,
			model: frontmatter.model,
			systemPromptMode: frontmatter.systemPromptMode === "append" ? "append" : "replace",
			inheritProjectContext: frontmatter.inheritProjectContext !== "false",
			inheritSkills: frontmatter.inheritSkills === "true",
			systemPrompt: body,
			source: "project",
			filePath,
		});
	}
	if (agents.length > 0) log("synced kiro agents loaded for discovery", { dir, count: agents.length });
	return agents;
}
