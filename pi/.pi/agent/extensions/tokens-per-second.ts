/**
 * Tokens Per Second — shows live output tok/s in the footer status bar.
 * Counts text_delta events as approximate tokens during streaming,
 * then shows accurate tok/s from final usage at message end.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	let startTime = 0;
	let firstTokenTime = 0;
	let deltaCount = 0;

	pi.on("agent_start", async (_event, ctx) => {
		ctx.ui.setStatus("tok/s", undefined);
	});

	pi.on("message_start", async (event) => {
		if (event.message.role !== "assistant") return;
		startTime = Date.now();
		firstTokenTime = 0;
		deltaCount = 0;
	});

	pi.on("message_update", async (event, ctx) => {
		const ame = event.assistantMessageEvent;

		if (!ame) return;

		if (ame.type === "text_delta" || ame.type === "thinking_delta") {
			if (!firstTokenTime) firstTokenTime = Date.now();
			deltaCount++;
		}

		if (deltaCount % 10 !== 0 || !firstTokenTime) return;
		const genTime = (Date.now() - firstTokenTime) / 1000;

		if (genTime < 0.3) return;

		const tps = deltaCount / genTime;
		const theme = ctx.ui.theme;

		ctx.ui.setStatus("tok/s", theme.fg("accent", "⚡") + theme.fg("dim", ` ~${tps.toFixed(1)} tok/s`));
	});

	pi.on("message_end", async (event, ctx) => {
		if (event.message.role !== "assistant") return;

		const elapsed = (Date.now() - startTime) / 1000;
		const theme = ctx.ui.theme;
		const output = event.message.usage?.output;

		if (elapsed < 0.1) {
			ctx.ui.setStatus("tok/s", undefined);
			return;
		}

		const ttft = firstTokenTime ? ((firstTokenTime - startTime) / 1000).toFixed(1) : "?";

		if (output && output > 0) {
			const genTime = firstTokenTime ? (Date.now() - firstTokenTime) / 1000 : elapsed;
			const tps = output / genTime;

			ctx.ui.setStatus("tok/s", theme.fg("success", "⚡") + theme.fg("dim", ` ${tps.toFixed(1)} tok/s · ${output} tok · ttft ${ttft}s`));
		} else if (deltaCount > 0) {
			const genTime = firstTokenTime ? (Date.now() - firstTokenTime) / 1000 : elapsed;
			const tps = deltaCount / genTime;

			ctx.ui.setStatus("tok/s", theme.fg("success", "⚡") + theme.fg("dim", ` ~${tps.toFixed(1)} tok/s · ~${deltaCount} tok · ttft ${ttft}s`));
		} else {
			ctx.ui.setStatus("tok/s", undefined);
		}
	});
}
