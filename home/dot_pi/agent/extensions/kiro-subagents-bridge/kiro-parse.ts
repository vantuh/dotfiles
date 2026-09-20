import * as fs from "node:fs";
import * as path from "node:path";

import { log } from "./logging.ts";

export interface KiroAgentJson {
	name: string;
	description?: string;
	model?: string;
	prompt?: string;
	tools?: string[];
	allowedTools?: string[];
	resources?: string[];
	mcpServers?: Record<string, unknown>;
	toolsSettings?: Record<string, unknown>;
}

export function readKiroAgentsFromDir(dir: string): Map<string, { config: KiroAgentJson; sourcePath: string }> {
	const agents = new Map<string, { config: KiroAgentJson; sourcePath: string }>();
	if (!fs.existsSync(dir)) {
		log("agents dir missing", { dir });
		return agents;
	}

	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		log("agents dir unreadable", { dir, error: message });
		return agents;
	}

	for (const entry of entries) {
		if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
		const sourcePath = path.join(dir, entry.name);
		let raw: string;
		try {
			raw = fs.readFileSync(sourcePath, "utf-8");
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			log("agent skipped", { file: entry.name, reason: `read failed: ${message}` });
			continue;
		}
		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			log("agent skipped", { file: entry.name, reason: `invalid JSON: ${message}` });
			continue;
		}
		if (!parsed || typeof parsed !== "object") {
			log("agent skipped", { file: entry.name, reason: "not an object" });
			continue;
		}
		const config = parsed as KiroAgentJson;
		if (typeof config.name !== "string" || !config.name.trim()) {
			log("agent skipped", { file: entry.name, reason: "missing name" });
			continue;
		}
		const name = config.name.trim();
		agents.set(name, { config, sourcePath });
		log("agent loaded", { name, sourcePath });
	}

	return agents;
}

export function mergeKiroAgents(
	global: Map<string, { config: KiroAgentJson; sourcePath: string }>,
	project: Map<string, { config: KiroAgentJson; sourcePath: string }>,
): Map<string, { config: KiroAgentJson; sourcePath: string }> {
	return new Map([...global, ...project]);
}
