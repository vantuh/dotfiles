import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { installDiscoverAgentsPatch } from "./discover-patch.ts";
import { log } from "./logging.ts";

/** Runs before pi-subagents (package order in settings.json). */
export default async function (_pi: ExtensionAPI) {
	const ok = await installDiscoverAgentsPatch();
	if (!ok) {
		console.warn(
			"[kiro-subagents-bridge] discoverAgents patch failed — project Kiro agents may be missing. See /tmp/kiro-subagents-bridge-debug.log",
		);
	}
}
