/**
 * Uses the agent profiles in `~/.pi/agent/agents/` for Pi Pocket's background subagents: a spawn with a profile's
 * name starts with the profile's body, takes the profile's `thinking` and `model` over what Pi asked for, and its
 * `tools` when Pi left them out.
 * A profile is found inside a longer name too: `scout-spec` and `pre-scout` run as `scout`.
 * Its sheet, Menu → Subagent models, changes the `model:` line of a profile.
 */
import { open, readdir, readFile, realpath, rename, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { parseFrontmatter } from "@earendil-works/pi-coding-agent";
import { defineExtension, wrapTool } from "@earendil-works/pi-durable";
import type { ToolRegistration } from "@earendil-works/pi-durable";
import type { Host, Web } from "../_pocket.d.ts";

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

/** A role as the sheet shows it: what the profile says, and whether the owner lets it run on that model. */
type RoleRow = {
    name: string;
    description: string;
    model: string | undefined;
    thinking: string | undefined;
    allowed: boolean;
};

/** A model the owner allowed for subagents, with the facts that help choose. */
type ModelRow = {
    spec: string;
    name: string;
    contextWindow?: number;
    cost?: { input: number; output: number };
};

async function rolesOf(host: Host): Promise<RoleRow[]> {
    const dir = join(host.agentDir, "agents");
    let files: string[];

    try {
        files = (await readdir(dir)).filter(
            (file) => file.endsWith(".md") && SAFE_NAME.test(file.slice(0, -3)),
        );
    } catch {
        return [];
    }

    const allowed = new Set(host.subagentModels());
    const rows = await Promise.all(
        files.sort().map(async (file) => {
            try {
                const { frontmatter } = parseFrontmatter(
                    await readFile(join(dir, file), "utf8"),
                );
                const model =
                    typeof frontmatter.model === "string" ? frontmatter.model.trim() : undefined;

                return {
                    name: file.slice(0, -3),
                    description:
                        typeof frontmatter.description === "string"
                            ? frontmatter.description.trim()
                            : "",
                    model,
                    thinking:
                        typeof frontmatter.thinking === "string"
                            ? frontmatter.thinking.trim()
                            : undefined,
                    allowed: model === undefined || allowed.has(model),
                };
            } catch {
                // A file that cannot be read or parsed shows no row: spawning by its name does nothing either.
                return undefined;
            }
        }),
    );

    return rows.filter((row) => row !== undefined);
}

function modelsOf(host: Host): ModelRow[] {
    return host.subagentModels().map((spec) => {
        const info = host.modelInfo(spec);

        return {
            spec,
            name: info?.name ?? spec.slice(spec.indexOf("/") + 1),
            ...(info?.contextWindow ? { contextWindow: info.contextWindow } : {}),
            ...(info?.cost ? { cost: info.cost } : {}),
        };
    });
}

/**
 * Writes or clears the `model:` line of a profile, and changes no other byte of it. Ported from the Pi extension
 * `pi-herdr-subagents` (`src/ui/agent-models/write.ts`), which keeps the same rule.
 */
async function setProfileModel(filePath: string, model: string | null): Promise<string | undefined> {
    let temporary: string | undefined;

    try {
        const target = await realpath(filePath);
        const content = await readFile(target, "utf8");
        const newline = content.includes("\r\n") ? "\r\n" : "\n";
        const lines = content.split(/\r?\n/);
        const end = lines.indexOf("---", 1);

        if (lines[0] !== "---" || end < 0) {
            return "This role has no complete frontmatter block.";
        }

        const found: number[] = [];

        for (let index = 1; index < end; index += 1) {
            if (/^model:/.test(lines[index])) found.push(index);
        }

        if (found.length > 1) return "This role has more than one model: line.";

        const { frontmatter } = parseFrontmatter<Record<string, unknown>>(content);
        const index = found[0];

        if (index === undefined && Object.hasOwn(frontmatter, "model")) {
            return "This role has a model that cannot be changed from here.";
        }

        if (model === null) {
            if (index === undefined) return undefined;
            lines.splice(index, 1);
        } else {
            const value = JSON.stringify(model);
            if (index === undefined) lines.splice(1, 0, `model: ${value}`);
            else lines[index] = `model: ${value}`;
        }

        const updated = lines.join(newline);
        const expected = { ...frontmatter };

        if (model === null) delete expected.model;
        else expected.model = model;

        // A line edit must not change another field, such as a value that runs over several lines.
        if (!isDeepStrictEqual(parseFrontmatter(updated).frontmatter, expected)) {
            return "This role's frontmatter cannot be changed from here.";
        }

        const { mode } = await stat(target);
        const tempPath = `${target}.subagent-roles.tmp`;
        const file = await open(tempPath, "wx", mode);

        temporary = tempPath;
        try {
            await file.writeFile(updated);
            // chmod keeps the permissions even when the process umask is stricter.
            await file.chmod(mode);
        } finally {
            await file.close();
        }

        await rename(tempPath, target);
        temporary = undefined;
        return undefined;
    } catch (error) {
        return error instanceof Error ? error.message : String(error);
    } finally {
        if (temporary !== undefined) await unlink(temporary).catch(() => {});
    }
}

export default function createSubagentRoles(host: Host, web: Web) {
    // Who each role runs on, as the sheet shows it: every profile, and the models the owner allows.
    web.route("GET", "roles", async () => ({ roles: await rolesOf(host), models: modelsOf(host) }));

    // A role's model, or null for Pi's own choice: written into the profile, never used on its own here.
    web.route("POST", "model", async ({ body }) => {
        const call = body as { name?: unknown; model?: unknown } | undefined;
        const name = typeof call?.name === "string" ? call.name : "";

        if (!SAFE_NAME.test(name) || name.includes("..")) {
            throw web.error(400, "No such role.");
        }

        const model = typeof call?.model === "string" && call.model !== "" ? call.model : null;

        // A model that the owner did not allow would refuse the next spawn, so it never reaches the file.
        if (model !== null && !host.subagentModels().includes(model)) {
            throw web.error(
                400,
                `${model} is not one of the models for subagents. Add it in Menu → Providers → Models for subagents.`,
            );
        }

        const failure = await setProfileModel(join(host.agentDir, "agents", `${name}.md`), model);

        if (failure !== undefined) throw web.error(400, failure);

        return { roles: await rolesOf(host) };
    });

    web.client("subagent-roles");

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
                            ...(found.thinking === undefined ? {} : { thinking: found.thinking }),
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
