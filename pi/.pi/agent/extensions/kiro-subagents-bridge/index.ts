import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";

import { formatKiroContextReport, gatherKiroContextForCwd } from "./context-report.ts";
import { log, LOG_FILE } from "./logging.ts";
import { findNearestKiroRoot, getProjectSyncOutDir } from "./paths.ts";
import { syncKiroAgentsForCwd } from "./sync.ts";

function runSync(cwd: string, reason = "session_start"): void {
	const result = syncKiroAgentsForCwd(cwd);
	if (result.agentNames.length === 0) {
		log("sync complete (empty)", { reason, cwd, globalDir: result.globalDir, globalNames: result.globalNames, kiroRoot: result.kiroRoot });
		return;
	}
	log("sync complete", {
		reason,
		cwd,
		written: result.written,
		unchanged: result.unchanged,
		removed: result.removed,
		kiroRoot: result.kiroRoot,
		globalNames: result.globalNames,
		agentNames: result.agentNames,
	});
	const parts = [
		`${result.agentNames.length} agent(s)`,
		result.written > 0 ? `${result.written} updated` : null,
		result.unchanged > 0 ? `${result.unchanged} unchanged` : null,
		result.removed > 0 ? `${result.removed} removed` : null,
	].filter(Boolean);
	const globalPart =
		result.globalNames.length > 0 ? `global: ${result.globalNames.join(", ")}` : "global: (none)";
	const projectPart =
		result.projectNames.length > 0
			? `project: ${result.projectNames.join(", ")}`
			: result.kiroRoot
				? "project: (none in .kiro/agents)"
				: "project: (not in a .kiro repo)";
	console.log(
		`[kiro-subagents-bridge] ${parts.join(", ")} → kiro-active/ (${globalPart}; ${projectPart})`,
	);
}

export default function (pi: ExtensionAPI) {
	log("extension loaded", { pid: process.pid, logFile: LOG_FILE });

	pi.on("session_start", (_event, ctx) => {
		log("session_start", { cwd: ctx.cwd });
		setImmediate(() => {
			try {
				runSync(ctx.cwd, "session_start");
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				log("sync failed", { cwd: ctx.cwd, error: message });
				console.error(`[kiro-subagents-bridge] sync failed: ${message} (see ${LOG_FILE})`);
			}
		});
	});

	pi.on("session_shutdown", (event, ctx) => {
		if (event.reason !== "quit") return;
		const kiroRoot = findNearestKiroRoot(ctx.cwd);
		if (!kiroRoot) return;
		const projectOutDir = getProjectSyncOutDir(kiroRoot);
		try {
			if (fs.existsSync(projectOutDir)) {
				fs.rmSync(projectOutDir, { recursive: true, force: true });
				log("project agents cleaned up", { reason: event.reason, kiroRoot, projectOutDir });
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			log("cleanup failed", { kiroRoot, projectOutDir, error: message });
		}
	});

	pi.registerCommand("kiro-context", {
		description: "Show what context each synced Kiro subagent includes (prompt, resources, limits)",
		handler: async (args, ctx: ExtensionCommandContext) => {
			const filterName = args.trim() || undefined;
			const report = gatherKiroContextForCwd(ctx.cwd, filterName);
			const text = formatKiroContextReport(report);
			log("kiro-context", {
				cwd: ctx.cwd,
				filterName,
				agentCount: report.visibleAgents.length,
			});
			pi.sendMessage(
				{ customType: "kiro-context", content: text, display: true },
				{ triggerTurn: false },
			);
		},
	});
}
