/**
 * Uses the agent profiles in `~/.pi/agent/agents/` for Pi Pocket's background subagents: a spawn with a profile's
 * name starts with the profile's body, and takes the profile's `tools`, `thinking`, and `model` when Pi left them out.
 * A profile is found inside a longer name too: `scout-spec` and `pre-scout` run as `scout`.
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseFrontmatter } from "@earendil-works/pi-coding-agent";
import { defineExtension, wrapTool } from "@earendil-works/pi-durable";
import type { ToolRegistration } from "@earendil-works/pi-durable";
import type { Host } from "./_pocket.d.ts";

type Profile = {
    body: string;
    tools: string[] | undefined;
    thinking: string | undefined;
    model: string | undefined;
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

/**
 * The profiles that a spawn name may mean, longest first: `scout-spec` is `scout`. The name is split into parts
 * (`-` or `_`), and a profile matches when its parts appear in it in order, so `pre-scout` is `scout` too.
 */
function candidatesOf(name: string, known: ReadonlySet<string>): string[] {
    if (!SAFE_NAME.test(name) || name.includes("..")) return [];

    const parts = name.split(/[-_]/);
    const found: string[] = [];

    for (let length = parts.length; length >= 1; length -= 1) {
        for (let start = 0; start + length <= parts.length; start += 1) {
            const candidate = parts.slice(start, start + length).join("-");
            if (known.has(candidate) && !found.includes(candidate)) found.push(candidate);
        }
    }

    return found;
}

async function profiles(host: Host): Promise<ReadonlySet<string>> {
    try {
        const files = await readdir(join(host.agentDir, "agents"));
        return new Set(files.filter((file) => file.endsWith(".md")).map((file) => file.slice(0, -3)));
    } catch {
        return new Set();
    }
}

async function profileOf(host: Host, name: string): Promise<Profile | undefined> {
    let text: string | undefined;
    for (const candidate of candidatesOf(name, await profiles(host))) {
        try {
            text = await readFile(join(host.agentDir, "agents", `${candidate}.md`), "utf8");
            break;
        } catch {
            // A file gone since the folder was read: try the next profile.
        }
    }

    if (text === undefined) return undefined;

    const { frontmatter, body } = parseFrontmatter(text);
    const asked =
        typeof frontmatter.thinking === "string" ? frontmatter.thinking.trim().toLowerCase() : undefined;
    const levels: readonly string[] = host.thinkingLevels;

    return {
        body: body.trim(),
        tools: toolsOf(frontmatter.tools),
        thinking: asked !== undefined && levels.includes(asked) ? asked : undefined,
        model: typeof frontmatter.model === "string" ? frontmatter.model.trim() : undefined,
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

                    const notes: string[] = [];

                    // A role may name tools that Pi Pocket does not have, as Pi's own packages add them. The tool
                    // refuses a name that this session does not offer, so keep the ones that it does.
                    const offered = new Set((await api.agent(context)).tools.map((each) => each.name));
                    const kept = found.tools?.filter((each) => offered.has(each));
                    if (call.tools === undefined) {
                        const missing = found.tools?.filter((each) => !offered.has(each)) ?? [];
                        if (missing.length > 0) {
                            notes.push(`These tools of your role are not available here: ${missing.join(", ")}.`);
                        }
                    }

                    // A role's model wins, and it must be one the owner allows: never fall back to the session's model,
                    // so a role can never start somewhere its profile did not name.
                    if (found.model !== undefined && !host.subagentModels().includes(found.model)) {
                        throw new Error(
                            `The role ${call.name} must run on ${found.model}, which the owner did not allow for subagents. Ask the owner to add it under Menu, Providers, Models for subagents.`,
                        );
                    }

                    const task = typeof call.message === "string" ? call.message.trim() : "";
                    const note = notes.length === 0 ? "" : `\n\n${notes.join(" ")}`;
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
                            ...(found.model === undefined ? {} : { model: found.model }),
                        },
                        api,
                        context,
                    );
                },
            })),
        ],
    });
}
