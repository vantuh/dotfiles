import * as path from "node:path";
import { pathToFileURL } from "node:url";

import { log } from "./logging.ts";
import { findNearestKiroRoot, getAgentDir, getKiroRepoOutDir } from "./paths.ts";
import { loadSyncedKiroAgentsFromDir } from "./synced-agent-load.ts";

type AgentScope = "user" | "project" | "both";

interface AgentDiscoveryResult {
	agents: Array<Record<string, unknown>>;
	projectAgentsDir: string | null;
}

let patchInstalled = false;

function replaceExport<T>(mod: Record<string, unknown>, key: string, value: T): boolean {
	try {
		mod[key] = value;
		return mod[key] === value;
	} catch {
		try {
			Object.defineProperty(mod, key, { value, configurable: true, writable: true });
			return mod[key] === value;
		} catch {
			return false;
		}
	}
}

function injectKiroProjectAgents(cwd: string, scope: AgentScope, result: AgentDiscoveryResult): AgentDiscoveryResult {
	const kiroRoot = findNearestKiroRoot(cwd);
	if (!kiroRoot || scope === "user") return result;

	const repoDir = getKiroRepoOutDir(kiroRoot);
	const kiroProject = loadSyncedKiroAgentsFromDir(repoDir);
	if (kiroProject.length === 0) return result;

	const agentMap = new Map<string, Record<string, unknown>>();
	for (const agent of result.agents) agentMap.set(String(agent.name), agent);
	for (const agent of kiroProject) agentMap.set(agent.name, agent);

	return { ...result, agents: [...agentMap.values()] };
}

/**
 * Wrap pi-subagents discovery so project Kiro agents come from ~/.pi/agent/kiro-by-repo/
 * for the current kiro root only — no files or symlinks inside git repos.
 *
 * Must run from preload.ts before the pi-subagents package extension loads.
 */
export async function installDiscoverAgentsPatch(): Promise<boolean> {
	if (patchInstalled) return true;

	const agentsModulePath = path.join(
		getAgentDir(),
		"npm/node_modules/pi-subagents/src/agents/agents.ts",
	);
	let agentsMod: Record<string, unknown>;
	try {
		agentsMod = (await import(pathToFileURL(agentsModulePath).href)) as Record<string, unknown>;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		log("discover patch import failed", { agentsModulePath, error: message });
		return false;
	}

	const origDiscover = agentsMod.discoverAgents as (cwd: string, scope: AgentScope) => AgentDiscoveryResult;
	const origDiscoverAll = agentsMod.discoverAgentsAll as (cwd: string) => Record<string, unknown>;

	if (typeof origDiscover !== "function" || typeof origDiscoverAll !== "function") {
		log("discover patch missing exports", { agentsModulePath });
		return false;
	}

	const discoverAgents = (cwd: string, scope: AgentScope) =>
		injectKiroProjectAgents(cwd, scope, origDiscover(cwd, scope));

	const discoverAgentsAll = (cwd: string) => {
		const all = origDiscoverAll(cwd) as {
			builtin: Record<string, unknown>[];
			user: Record<string, unknown>[];
			project: Record<string, unknown>[];
			[key: string]: unknown;
		};
		const kiroRoot = findNearestKiroRoot(cwd);
		if (!kiroRoot) return all;

		const kiroProject = loadSyncedKiroAgentsFromDir(getKiroRepoOutDir(kiroRoot));
		if (kiroProject.length === 0) return all;

		const projectMap = new Map<string, Record<string, unknown>>();
		for (const agent of all.project ?? []) projectMap.set(String(agent.name), agent);
		for (const agent of kiroProject) projectMap.set(agent.name, agent);

		return { ...all, project: [...projectMap.values()] };
	};

	const okDiscover = replaceExport(agentsMod, "discoverAgents", discoverAgents);
	const okDiscoverAll = replaceExport(agentsMod, "discoverAgentsAll", discoverAgentsAll);
	if (!okDiscover || !okDiscoverAll) {
		log("discover patch assign failed", { okDiscover, okDiscoverAll });
		return false;
	}

	patchInstalled = true;
	log("discover patch installed", { agentsModulePath });
	return true;
}
