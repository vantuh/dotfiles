import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const HERDR_TOOL_NAME = /\bherdr_agent\b/g;

export default function composerHerdrAgentName(pi: ExtensionAPI) {
	pi.on("before_agent_start", async (event, ctx) => {
		if (ctx.model?.provider !== "cursor" || !ctx.model.id.startsWith("composer")) {
			return;
		}

		return {
			systemPrompt: event.systemPrompt.replace(
				HERDR_TOOL_NAME,
				"pi__herdr_agent",
			),
		};
	});
}
