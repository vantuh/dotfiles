import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import { kiroAgentToMarkdown } from "./map-to-pi.ts";
import { readKiroAgentsFromDir } from "./kiro-parse.ts";
import { log } from "./logging.ts";
import {
	findNearestKiroRoot,
	getGlobalKiroAgentsDir,
	getKiroGlobalOutDir,
	getKiroRepoOutDir,
	getProjectKiroAgentsDir,
} from "./paths.ts";

export interface SyncResult {
	written: number;
	unchanged: number;
	removed: number;
	kiroRoot: string | null;
	globalDir: string;
	globalNames: string[];
	projectNames: string[];
	agentNames: string[];
}

interface AgentEntry {
	config: import("./kiro-parse.ts").KiroAgentJson;
	sourcePath: string;
}

interface SliceResult {
	written: number;
	unchanged: number;
	removed: number;
	names: string[];
}

function ensureDir(dir: string): void {
	if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function sha256(text: string): string {
	return crypto.createHash("sha256").update(text).digest("hex");
}

function listJsonFiles(dir: string): string[] {
	if (!fs.existsSync(dir)) return [];
	try {
		return fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
	} catch {
		return [];
	}
}

function emptyDir(dir: string): void {
	ensureDir(dir);
	for (const entry of fs.readdirSync(dir)) {
		const full = path.join(dir, entry);
		fs.rmSync(full, { recursive: true, force: true });
	}
}

function writeScopeManifest(kiroRoot: string): void {
	const projectDir = getKiroRepoOutDir(kiroRoot);
	ensureDir(projectDir);
	const manifestPath = path.join(projectDir, ".scope.json");
	fs.writeFileSync(
		manifestPath,
		`${JSON.stringify({ kiroRoot, syncedAt: new Date().toISOString() }, null, 2)}\n`,
		"utf-8",
	);
}

function syncAgentSlice(
	agents: Map<string, AgentEntry>,
	outDir: string,
	kiroRoot: string | null,
	scope: "global" | "project",
): SliceResult {
	ensureDir(outDir);

	const expectedFiles = new Set<string>();
	const names: string[] = [];
	let written = 0;
	let unchanged = 0;

	for (const [, { config, sourcePath }] of agents) {
		const localName = config.name.trim();
		const fileName = `${localName}.md`;
		expectedFiles.add(fileName);
		const outPath = path.join(outDir, fileName);
		const markdown = kiroAgentToMarkdown(config, sourcePath, kiroRoot);
		const hash = sha256(markdown);
		const hashPath = `${outPath}.sha256`;

		let prevHash: string | null = null;
		try {
			prevHash = fs.readFileSync(hashPath, "utf-8").trim();
		} catch {
			prevHash = null;
		}

		if (prevHash === hash && fs.existsSync(outPath)) {
			unchanged++;
			log("agent unchanged", { scope, name: localName, outPath });
		} else {
			fs.writeFileSync(outPath, markdown, "utf-8");
			fs.writeFileSync(hashPath, `${hash}\n`, "utf-8");
			written++;
			log("agent written", {
				scope,
				name: localName,
				outPath,
				bytes: Buffer.byteLength(markdown, "utf-8"),
				model: config.model,
				sourcePath,
			});
		}
		names.push(`kiro.${localName}`);
	}

	let removed = 0;
	if (fs.existsSync(outDir)) {
		for (const entry of fs.readdirSync(outDir)) {
			if (entry === ".scope.json") continue;
			if (!entry.endsWith(".md")) continue;
			if (expectedFiles.has(entry)) continue;
			const full = path.join(outDir, entry);
			fs.rmSync(full, { force: true });
			const sidecar = path.join(outDir, `${entry}.sha256`);
			if (fs.existsSync(sidecar)) fs.rmSync(sidecar, { force: true });
			removed++;
			log("agent removed", { scope, file: entry });
		}
	}

	return { written, unchanged, removed, names };
}

function buildGlobalAgentsToWrite(
	globalAgents: Map<string, AgentEntry>,
	projectAgents: Map<string, AgentEntry>,
): Map<string, AgentEntry> {
	const out = new Map<string, AgentEntry>();
	for (const [name, entry] of globalAgents) {
		if (projectAgents.has(name)) {
			log("global agent hidden by project override", { name });
			continue;
		}
		out.set(name, entry);
	}
	return out;
}

/** Sync only ~/.kiro/agents → kiro-active/global/ (optional; not used on session lifecycle). */
export function syncGlobalAgentsForCwd(cwd: string): SyncResult {
	const globalDir = getGlobalKiroAgentsDir();
	const kiroRoot = findNearestKiroRoot(cwd);
	const projectDir = kiroRoot ? getProjectKiroAgentsDir(kiroRoot) : null;
	const projectAgents = projectDir ? readKiroAgentsFromDir(projectDir) : new Map();
	const globalAgents = readKiroAgentsFromDir(globalDir);
	const globalToWrite = buildGlobalAgentsToWrite(globalAgents, projectAgents);

	log("sync global only", {
		cwd,
		globalDir,
		globalJsonFiles: listJsonFiles(globalDir),
		globalToWrite: [...globalToWrite.keys()],
		projectOverrideNames: [...projectAgents.keys()],
	});

	const globalSlice = syncAgentSlice(globalToWrite, getKiroGlobalOutDir(), null, "global");

	return {
		written: globalSlice.written,
		unchanged: globalSlice.unchanged,
		removed: globalSlice.removed,
		kiroRoot,
		globalDir,
		globalNames: [...globalToWrite.keys()],
		projectNames: [...projectAgents.keys()],
		agentNames: globalSlice.names,
	};
}

/** Full sync: global (always) + project (only when cwd is under a repo .kiro). */
export function syncKiroAgentsForCwd(cwd: string): SyncResult {
	const globalDir = getGlobalKiroAgentsDir();
	const globalJsonFiles = listJsonFiles(globalDir);
	const kiroRoot = findNearestKiroRoot(cwd);
	const projectDir = kiroRoot ? getProjectKiroAgentsDir(kiroRoot) : null;
	const projectJsonFiles = projectDir ? listJsonFiles(projectDir) : [];

	log("sync start", {
		cwd,
		globalDir,
		globalJsonFiles,
		projectDir,
		projectJsonFiles,
		kiroRoot,
		globalOut: getKiroGlobalOutDir(),
		projectOut: kiroRoot ? getKiroRepoOutDir(kiroRoot) : null,
	});

	const globalAgents = readKiroAgentsFromDir(globalDir);
	const projectAgents = projectDir ? readKiroAgentsFromDir(projectDir) : new Map();
	const globalToWrite = buildGlobalAgentsToWrite(globalAgents, projectAgents);

	log("agents discovered", {
		globalCount: globalAgents.size,
		projectCount: projectAgents.size,
		globalWritten: globalToWrite.size,
		globalNames: [...globalAgents.keys()],
		projectNames: [...projectAgents.keys()],
	});

	if (globalJsonFiles.length > 0 && globalAgents.size === 0) {
		log("global agents parse failed", {
			globalDir,
			globalJsonFiles,
			hint: "check agent skipped entries above",
		});
	}

	const globalSlice = syncAgentSlice(globalToWrite, getKiroGlobalOutDir(), null, "global");

	let projectSlice: SliceResult = { written: 0, unchanged: 0, removed: 0, names: [] };
	if (kiroRoot) {
		const repoOutDir = getKiroRepoOutDir(kiroRoot);
		if (projectAgents.size > 0) {
			projectSlice = syncAgentSlice(projectAgents, repoOutDir, kiroRoot, "project");
			writeScopeManifest(kiroRoot);
			log("project scope active", { kiroRoot, repoOutDir, agentCount: projectAgents.size });
		} else {
			emptyDir(repoOutDir);
			if (projectJsonFiles.length > 0) {
				log("project agents parse failed", { projectDir, projectJsonFiles });
			} else {
				log("project scope empty", { kiroRoot, repoOutDir });
			}
		}
	} else {
		log("no kiro project root for cwd", { cwd });
	}

	const agentNames = [...globalSlice.names, ...projectSlice.names];
	const result: SyncResult = {
		written: globalSlice.written + projectSlice.written,
		unchanged: globalSlice.unchanged + projectSlice.unchanged,
		removed: globalSlice.removed + projectSlice.removed,
		kiroRoot,
		globalDir,
		globalNames: [...globalToWrite.keys()],
		projectNames: [...projectAgents.keys()],
		agentNames,
	};

	log("sync done", result);
	return result;
}
