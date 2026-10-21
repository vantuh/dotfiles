/**
 * Uses the agent profiles in `~/.pi/agent/agents/` for Pi Pocket's background subagents: a spawn with a profile's
 * name starts with the profile's body, and takes the profile's `tools` and `thinking` when Pi left them out.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseFrontmatter } from "@earendil-works/pi-coding-agent";
import { defineExtension, wrapTool } from "@earendil-works/pi-durable";
import type { ToolRegistration } from "@earendil-works/pi-durable";
import type { Host } from "./_pocket.d.ts";

type Profile = {
    body: string;
    tools: string[] | undefined;
    thinking: string | undefined;
};

/** `wrapTool` reads only the name of this stand-in for the tool that it wraps. */
const subagentTool = { name: "subagent" } as unknown as ToolRegistration;

/** Names come from a model: only a plain file name in the profiles folder is read. */
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function toolsOf(value: unknown): string[] | undefined {
    const list = (Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [])
        .map((each) => String(each).trim())
        .filter((each) => each !== "");

    return list.length === 0 ? undefined : list;
}

async function profileOf(host: Host, name: string): Promise<Profile | undefined> {
    if (!SAFE_NAME.test(name) || name.includes("..")) return undefined;

    let text: string;
    try {
        text = await readFile(join(host.agentDir, "agents", `${name}.md`), "utf8");
    } catch {
        return undefined;
    }

    const { frontmatter, body } = parseFrontmatter(text);
    const asked =
        typeof frontmatter.thinking === "string" ? frontmatter.thinking.trim().toLowerCase() : undefined;
    const levels: readonly string[] = host.thinkingLevels;

    return {
        body: body.trim(),
        tools: toolsOf(frontmatter.tools),
        thinking: asked !== undefined && levels.includes(asked) ? asked : undefined,
    };
}

export default function createSubagentRoles(host: Host) {
    return defineExtension({
        name: "subagent-roles",
        wraps: [
            wrapTool(subagentTool, (tool) => ({
                ...tool,
                execute: async (args, api, context) => {
                    const call = args as Record<string, unknown>;
                    if (call.action !== "spawn" || typeof call.name !== "string") {
                        return tool.execute(args, api, context);
                    }

                    const found = await profileOf(host, call.name);
                    if (found === undefined || found.body === "") return tool.execute(args, api, context);

                    // A role may name tools that Pi Pocket does not have, as Pi's own packages add them. The tool
                    // refuses a name that this session does not offer, so keep the ones that it does.
                    const offered = new Set((await api.agent(context)).tools.map((each) => each.name));
                    const kept = found.tools?.filter((each) => offered.has(each));
                    const missing =
                        call.tools === undefined
                            ? (found.tools?.filter((each) => !offered.has(each)) ?? [])
                            : [];

                    const task = typeof call.message === "string" ? call.message.trim() : "";
                    const note =
                        missing.length === 0
                            ? ""
                            : `\n\nNote: these tools of your role are not available here: ${missing.join(", ")}.`;
                    return tool.execute(
                        {
                            ...call,
                            message: `${found.body}${note}\n\n## Your task\n\n${task}`,
                            ...(call.tools === undefined && kept !== undefined && kept.length > 0
                                ? { tools: kept }
                                : {}),
                            ...(call.thinking === undefined && found.thinking !== undefined
                                ? { thinking: found.thinking }
                                : {}),
                        },
                        api,
                        context,
                    );
                },
            })),
        ],
    });
}
