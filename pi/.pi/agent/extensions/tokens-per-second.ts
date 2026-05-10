/**
 * Tokens Per Second — publishes live tok/s + ttft to status key "tok/s".
 * Designed for pi-powerline-footer customItems consumption.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	let requestTime = 0;
	let firstTokenTime = 0;
	let deltaCount = 0;

	pi.on("agent_start", async (_event, ctx) => {
		requestTime = Date.now();
		firstTokenTime = 0;
		deltaCount = 0;
		ctx.ui.setStatus("tok/s", undefined);
	});

	pi.on("before_provider_request", async () => {
		requestTime = Date.now();
		firstTokenTime = 0;
		deltaCount = 0;
	});

	pi.on("message_update", async (event, ctx) => {
		if (!firstTokenTime) firstTokenTime = Date.now();

		const ame = event.assistantMessageEvent;
		if (ame && (ame.type === "text_delta" || ame.type === "thinking_delta")) {
			deltaCount++;
		}

		if (deltaCount % 10 !== 0 || !firstTokenTime) return;
		const genTime = (Date.now() - firstTokenTime) / 1000;
		if (genTime < 0.3) return;

		const tps = deltaCount / genTime;
		const ttft = ((firstTokenTime - requestTime) / 1000).toFixed(1);
		ctx.ui.setStatus("tok/s", `~${tps.toFixed(0)} tok/s · ttft ${ttft}s`);
	});

	pi.on("message_end", async (event, ctx) => {
		if (event.message.role !== "assistant") return;

		if (!requestTime) {
			ctx.ui.setStatus("tok/s", undefined);
			return;
		}

		const elapsed = (Date.now() - requestTime) / 1000;
		const output = event.message.usage?.output;

		if (elapsed < 0.1) {
			ctx.ui.setStatus("tok/s", undefined);
			return;
		}

		const ttft = firstTokenTime ? ((firstTokenTime - requestTime) / 1000).toFixed(1) : "?";

		if (output && output > 0) {
			const genTime = firstTokenTime ? (Date.now() - firstTokenTime) / 1000 : elapsed;
			const tps = output / genTime;
			ctx.ui.setStatus("tok/s", `${tps.toFixed(0)} tok/s · ttft ${ttft}s`);
		} else {
			const genTime = firstTokenTime ? (Date.now() - firstTokenTime) / 1000 : elapsed;
			const tps = deltaCount > 0 ? deltaCount / genTime : 0;
			if (tps > 0) {
				ctx.ui.setStatus("tok/s", `~${tps.toFixed(0)} tok/s · ttft ${ttft}s`);
			} else {
				ctx.ui.setStatus("tok/s", `ttft ${ttft}s`);
			}
		}
	});
}
