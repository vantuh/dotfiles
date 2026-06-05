/**
 * Tokens Per Second — live tok/s to status key "tok/s".
 * Aggregates across the full agent run and reports summary at end.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	let firstTokenTime = 0;
	let deltaCount = 0;
	let totalOutputTokens = 0;
	let totalStreamMs = 0;

	pi.on("agent_start", async (_event, ctx) => {
		firstTokenTime = 0;
		deltaCount = 0;
		totalOutputTokens = 0;
		totalStreamMs = 0;
		ctx.ui.setStatus("tok/s", ctx.ui.theme.fg("dim", "⏱ generating..."));
	});

	pi.on("before_provider_request", async () => {
		firstTokenTime = 0;
		deltaCount = 0;
	});

	pi.on("message_update", async (event, ctx) => {
		const ame = event.assistantMessageEvent;
		if (!ame || (ame.type !== "text_delta" && ame.type !== "thinking_delta" && ame.type !== "toolcall_delta")) return;

		if (!firstTokenTime) firstTokenTime = Date.now();
		deltaCount++;

		if (deltaCount % 10 !== 0) return;
		const genTime = (Date.now() - firstTokenTime) / 1000;
		if (genTime < 0.3) return;

		const official = event.message.usage?.output;
		const tokens = official && official > 0 ? official : deltaCount;
		const tps = Math.round(tokens / genTime);
		const theme = ctx.ui.theme;
		ctx.ui.setStatus("tok/s", theme.fg("accent", `${tps} tok/s`));
	});

	pi.on("message_end", async (event) => {
		if (event.message.role !== "assistant" || !firstTokenTime) return;

		const output = event.message.usage?.output ?? 0;
		const streamMs = Date.now() - firstTokenTime;

		if (output > 0) totalOutputTokens += output;
		else totalOutputTokens += deltaCount;
		totalStreamMs += streamMs;
	});

	pi.on("agent_end", async (_event, ctx) => {
		const elapsed = totalStreamMs / 1000;
		const theme = ctx.ui.theme;

		if (elapsed < 0.1 || totalOutputTokens <= 0) {
			ctx.ui.setStatus("tok/s", undefined);
			return;
		}

		const tps = Math.round(totalOutputTokens / elapsed);
		ctx.ui.setStatus("tok/s", `${theme.fg("accent", `${tps} tok/s`)} ${theme.fg("dim", `· ${totalOutputTokens} tok in ${elapsed.toFixed(1)}s`)}`);
	});
}
