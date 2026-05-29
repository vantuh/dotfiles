import * as fs from "node:fs";
import * as path from "node:path";

import type { KiroAgentJson } from "./kiro-parse.ts";
import { isKiroAcpCompatible, kiroMcpWarning, requiresKiroMcp } from "./kiro-compat.ts";
import { log } from "./logging.ts";
import { mapKiroModel } from "./model-map.ts";

const MAX_RESOURCE_FILES = 20;
const MAX_RESOURCE_BYTES = 120_000;

const KIRO_BUILTIN_TOOLS = ["read", "grep", "find", "ls", "bash", "write"];

function escapeYamlScalar(value: string): string {
	if (/[:#{}[\],&*?|>!'"%@`]|^\s|\s$/.test(value)) {
		return JSON.stringify(value);
	}
	return value;
}

export function resolveFileUri(uri: string, jsonDir: string, kiroRoot: string | null): string | null {
	if (!uri.startsWith("file://")) return null;
	const raw = uri.slice("file://".length).replace(/^\.\//, "");
	if (!raw) return null;
	if (path.isAbsolute(raw)) return raw;
	const candidates = [path.resolve(jsonDir, raw)];
	if (kiroRoot) candidates.push(path.resolve(kiroRoot, raw));
	for (const candidate of candidates) {
		if (fs.existsSync(candidate)) return candidate;
	}
	return path.resolve(jsonDir, raw);
}

function readTextFile(filePath: string, maxBytes: number): string | null {
	try {
		const stat = fs.statSync(filePath);
		if (!stat.isFile() || stat.size > maxBytes) return null;
		return fs.readFileSync(filePath, "utf-8");
	} catch {
		return null;
	}
}

export function expandResourceGlob(
	pattern: string,
	jsonDir: string,
	kiroRoot: string | null,
): string[] {
	const resolved = resolveFileUri(pattern.startsWith("file://") ? pattern : `file://${pattern}`, jsonDir, kiroRoot);
	if (!resolved) return [];

	if (!pattern.includes("*")) {
		return fs.existsSync(resolved) ? [resolved] : [];
	}

	const dir = path.dirname(resolved);
	const base = path.basename(resolved);
	if (!fs.existsSync(dir)) return [];

	const files: string[] = [];
	const walk = (currentDir: string, depth: number) => {
		if (files.length >= MAX_RESOURCE_FILES || depth > 8) return;
		let entries: fs.Dirent[];
		try {
			entries = fs.readdirSync(currentDir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			if (files.length >= MAX_RESOURCE_FILES) break;
			const full = path.join(currentDir, entry.name);
			if (entry.isDirectory()) {
				if (base.includes("**") || entry.name !== "node_modules") walk(full, depth + 1);
				continue;
			}
			if (!entry.isFile()) continue;
			if (base.includes("**") && base.endsWith(".md") && !entry.name.endsWith(".md")) continue;
			files.push(full);
		}
	};
	walk(dir, 0);
	return files.slice(0, MAX_RESOURCE_FILES);
}

function mapKiroTools(tools: string[] | undefined, mcpOnly: boolean): string[] {
	if (mcpOnly) {
		// Do not inject fake builtins — prompt expects Kiro MCP tools that Pi does not have.
		return ["read", "grep", "find", "ls"];
	}
	if (!tools?.length) return [...KIRO_BUILTIN_TOOLS];
	const out = new Set<string>();
	for (const tool of tools) {
		const t = tool.trim();
		if (!t || t === "@builtin") {
			for (const b of KIRO_BUILTIN_TOOLS) out.add(b);
			continue;
		}
		if (t.startsWith("@")) continue;
		if (t === "shell") {
			out.add("bash");
			continue;
		}
		if (["read", "write", "grep", "find", "ls", "bash", "todo"].includes(t)) out.add(t === "todo" ? "bash" : t);
	}
	if (out.size === 0) return [...KIRO_BUILTIN_TOOLS];
	return [...out];
}

export function kiroAgentToMarkdown(
	agent: KiroAgentJson,
	sourcePath: string,
	kiroRoot: string | null,
): string {
	const jsonDir = path.dirname(sourcePath);
	const name = agent.name.trim();
	const description =
		agent.description?.trim() ||
		`Kiro agent imported from ${path.basename(sourcePath)}`;

	const lines: string[] = ["---"];
	lines.push(`name: ${escapeYamlScalar(name)}`);
	lines.push("package: kiro");
	lines.push(`description: ${escapeYamlScalar(description)}`);

	const mcpOnly = requiresKiroMcp(agent);
	const piTools = mapKiroTools(agent.tools, mcpOnly);
	lines.push(`tools: ${piTools.join(", ")}`);

	const model = mapKiroModel(agent, agent.model);
	if (model) lines.push(`model: ${model}`);
	else if (!isKiroAcpCompatible(agent)) {
		log("kiro-acp skipped", {
			name,
			reason: "mcpServers require native Kiro or Pi MCP config",
			kiroModel: agent.model,
		});
	}

	lines.push("systemPromptMode: replace");
	lines.push("inheritProjectContext: true");
	lines.push("inheritSkills: false");
	lines.push("---");
	lines.push("");

	const bodyParts: string[] = [];

	const mcpWarning = kiroMcpWarning(agent);
	if (mcpWarning) bodyParts.push(mcpWarning);

	if (agent.prompt) {
		const promptPath = resolveFileUri(agent.prompt, jsonDir, kiroRoot);
		if (promptPath) {
			const text = readTextFile(promptPath, 500_000);
			if (text) {
				bodyParts.push(text.trim());
				log("prompt loaded", { name, path: promptPath, chars: text.length });
			} else {
				log("prompt unresolved", { name, prompt: agent.prompt, reason: "file empty or too large" });
				bodyParts.push(`<!-- unresolved prompt: ${agent.prompt} -->`);
			}
		} else {
			log("prompt unresolved", { name, prompt: agent.prompt });
			bodyParts.push(`<!-- unresolved prompt: ${agent.prompt} -->`);
		}
	}

	if (agent.resources?.length) {
		bodyParts.push("## Kiro resources\n");
		let totalBytes = 0;
		for (const resource of agent.resources) {
			if (resource.startsWith("skill://")) {
				log("resources skipped", { name, resource, reason: "skill:// not expanded in Pi" });
				continue;
			}
			const files = expandResourceGlob(resource, jsonDir, kiroRoot);
			if (files.length === 0) {
				log("resources skipped", { name, resource, reason: "no files matched" });
			}
			for (const file of files) {
				if (totalBytes >= MAX_RESOURCE_BYTES) break;
				const text = readTextFile(file, MAX_RESOURCE_BYTES - totalBytes);
				if (!text) continue;
				totalBytes += text.length;
				bodyParts.push(`### ${path.relative(kiroRoot ?? jsonDir, file)}\n\n${text.trim()}\n`);
			}
		}
	}

	if (agent.mcpServers && Object.keys(agent.mcpServers).length > 0) {
		log("mcpServers present", { name, servers: Object.keys(agent.mcpServers) });
	}

	lines.push(bodyParts.join("\n\n").trimEnd());
	if (!bodyParts.length) lines.push(`You are the Kiro agent \`${name}\`.`);
	return lines.join("\n") + "\n";
}
