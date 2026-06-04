import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export function getAgentDir(): string {
	const envCandidates = ["OMP_CODING_AGENT_DIR", "PI_CODING_AGENT_DIR", "TAU_CODING_AGENT_DIR"];
	for (const key of envCandidates) {
		const value = process.env[key];
		if (value) {
			if (value === "~") return os.homedir();
			if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
			return value;
		}
	}
	for (const [key, value] of Object.entries(process.env)) {
		if (key.endsWith("_CODING_AGENT_DIR") && value) {
			if (value === "~") return os.homedir();
			if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
			return value;
		}
	}
	return path.join(os.homedir(), ".omp", "agent");
}

/** Root for converted global Kiro agents (OMP task agents user scope). */
export function getKiroActiveAgentsDir(): string {
	return path.join(getAgentDir(), "agents", "kiro-active");
}

/** Global Kiro agents — visible in every OMP session (user scope). */
export function getKiroGlobalOutDir(): string {
	return path.join(getKiroActiveAgentsDir(), "global");
}

/** Project Kiro agents — synced into kiro-active/<basename>/ so OMP discovers them as user scope. */
export function getProjectSyncOutDir(kiroRoot: string): string {
	const basename = path.basename(kiroRoot).replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "project";
	return path.join(getKiroActiveAgentsDir(), basename);
}

export function getGlobalKiroAgentsDir(): string {
	return path.join(os.homedir(), ".kiro", "agents");
}

function isDirectory(p: string): boolean {
	try {
		return fs.statSync(p).isDirectory();
	} catch {
		return false;
	}
}

/** Walk up from cwd until a directory contains `.kiro/` (excludes `~/.kiro` — global Kiro home). */
export function findNearestKiroRoot(cwd: string): string | null {
	const home = path.resolve(os.homedir());
	let current = path.resolve(cwd);
	while (true) {
		if (current !== home && isDirectory(path.join(current, ".kiro"))) {
			return current;
		}
		const parent = path.dirname(current);
		if (parent === current) return null;
		current = parent;
	}
}

export function getProjectKiroAgentsDir(kiroRoot: string): string {
	return path.join(kiroRoot, ".kiro", "agents");
}
