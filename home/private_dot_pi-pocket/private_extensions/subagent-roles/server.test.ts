import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import createSubagentRoles from "./server.ts";
import type { Host, Web } from "../_pocket.d.ts";

type Recorded = Record<string, unknown>;

/** A `web` that keeps the routes and the browser modules a module registers, so a test can call them. */
function fakeWeb() {
    const routes = new Map<string, (request: Recorded) => unknown>();
    const clients: string[] = [];
    const web = {
        route: (method: string, path: string, handle: (request: Recorded) => unknown) => {
            routes.set(`${method} ${path}`, handle);
        },
        client: (entry: string) => {
            clients.push(entry);
        },
        error: (status: number, message: string) =>
            Object.assign(new Error(message), { status }),
    } as unknown as Web;

    return { web, routes, clients };
}

const WORKER_MODEL = "openrouter/deepseek/deepseek-v4.1-flash-1017";

const WORKER = `---
name: worker
description: Implementation agent
tools: read, grep, edit, write, web_search
model: ${WORKER_MODEL}
thinking: high
---

You are worker: the implementation subagent.
`;

/** The allowed models, with the facts that `host.modelInfo` gives for them. */
const MODELS: Recorded = {
    [WORKER_MODEL]: { name: "DeepSeek v4.1 Flash", contextWindow: 262000, cost: { input: 0.15, output: 0.6 } },
};

/** The tools that a Pi Pocket session offers. */
const OFFERED = ["read", "write", "edit", "bash"];

/** Runs the wrapped subagent tool with a fake one that records the arguments that reach it. */
async function call(agentDir: string, args: Recorded, allowed: string[] = [WORKER_MODEL]): Promise<Recorded> {
    const host = {
        agentDir,
        thinkingLevels: ["off", "minimal", "low", "medium", "high", "xhigh", "max"],
        subagentModels: () => allowed,
    } as unknown as Host;
    const [wrap] = createSubagentRoles(host, fakeWeb().web).wraps ?? [];
    assert.ok(wrap !== undefined && "tool" in wrap);

    let seen: Recorded | undefined;
    const fake = {
        name: "subagent",
        description: "",
        parameters: {},
        execute: async (received: Recorded) => {
            seen = received;
            return { output: [] };
        },
    };
    const wrapped = wrap.wrap(fake as never);
    const api = {
        agent: async () => ({ tools: OFFERED.map((name) => ({ name })) }),
    };

    await wrapped.execute(args as never, api as never, {} as never);
    assert.ok(seen !== undefined);
    return seen;
}

async function profiles(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "subagent-roles-"));
    await mkdir(join(dir, "agents"));
    await writeFile(join(dir, "agents", "worker.md"), WORKER);
    return dir;
}

test("a role's body starts the spawn message, with only the tools this session offers", async () => {
    const dir = await profiles();
    try {
        const seen = await call(dir, { action: "spawn", name: "worker", message: "fix the bug" });

        assert.equal(
            seen.message,
            "You are worker: the implementation subagent.\n\n" +
                "These tools of your role are not available here: grep, web_search.\n\n" +
                "## Your task\n\nfix the bug",
        );
        assert.deepEqual(seen.tools, ["read", "edit", "write"]);
        assert.equal(seen.thinking, "high");
        assert.equal(seen.model, WORKER_MODEL);
    } finally {
        await rm(dir, { recursive: true });
    }
});

test("what Pi chose wins over the role's tools, never over its thinking or model", async () => {
    const dir = await profiles();
    try {
        const seen = await call(dir, {
            action: "spawn",
            name: "worker",
            message: "fix the bug",
            tools: ["bash"],
            thinking: "low",
            model: "openai/gpt-6.1-sol",
        });

        assert.deepEqual(seen.tools, ["bash"]);
        assert.equal(seen.thinking, "high");
        assert.equal(seen.model, WORKER_MODEL);
        assert.equal(seen.message, "You are worker: the implementation subagent.\n\n## Your task\n\nfix the bug");
    } finally {
        await rm(dir, { recursive: true });
    }
});

test("a role's model that the owner did not allow stops the spawn", async () => {
    const dir = await profiles();
    try {
        await assert.rejects(
            call(dir, { action: "spawn", name: "worker", message: "fix the bug" }, []),
            /The role worker must run on openrouter\/deepseek\/deepseek-v4\.1-flash-1017, which the owner did not allow/,
        );
    } finally {
        await rm(dir, { recursive: true });
    }
});

test("a profile is found inside a longer name, with a suffix, a prefix, or both", async () => {
    const dir = await profiles();
    try {
        for (const name of ["worker-2", "pre-worker", "my-worker-check"]) {
            const seen = await call(dir, { action: "spawn", name, message: "fix the bug" });

            assert.equal(seen.model, WORKER_MODEL);
            assert.match(String(seen.message), /^You are worker: the implementation subagent\./);
        }
    } finally {
        await rm(dir, { recursive: true });
    }
});

test("an unknown name, a path outside the folder, and other actions pass through", async () => {
    const dir = await profiles();
    try {
        for (const args of [
            { action: "spawn", name: "nobody", message: "fix it" },
            { action: "spawn", name: "../worker", message: "fix it" },
            { action: "send", name: "worker", message: "fix it" },
        ]) {
            assert.deepEqual(await call(dir, args), args);
        }
    } finally {
        await rm(dir, { recursive: true });
    }
});

const NO_MODEL = `---
name: reviewer
description: Review agent
---

You are reviewer.
`;

/** The module's routes over a folder of profiles, so a test can call them as the sheet does. */
async function routes(allowed: string[] = [WORKER_MODEL]) {
    const dir = await profiles();
    const host = {
        agentDir: dir,
        thinkingLevels: ["off", "minimal", "low", "medium", "high", "xhigh", "max"],
        subagentModels: () => allowed,
        modelInfo: (spec: string) => MODELS[spec],
    } as unknown as Host;
    const web = fakeWeb();

    createSubagentRoles(host, web.web);

    return {
        dir,
        clients: web.clients,
        get: (path: string) => web.routes.get(`GET ${path}`)?.( {}) as Promise<Recorded>,
        post: (path: string, body: Recorded) =>
            web.routes.get(`POST ${path}`)?.({ body }) as Promise<Recorded>,
    };
}

test("the roles route lists each profile and the models the owner allows", async () => {
    const api = await routes();
    try {
        const data = (await api.get("roles")) as { roles: Recorded[]; models: Recorded[] };

        assert.equal(data.roles.length, 1);
        assert.deepEqual(data.roles[0], {
            name: "worker",
            description: "Implementation agent",
            model: WORKER_MODEL,
            thinking: "high",
            allowed: true,
        });
        assert.deepEqual(data.models, [
            {
                spec: WORKER_MODEL,
                name: "DeepSeek v4.1 Flash",
                contextWindow: 262000,
                cost: { input: 0.15, output: 0.6 },
            },
        ]);
        assert.deepEqual(api.clients, ["subagent-roles"]);
    } finally {
        await rm(api.dir, { recursive: true });
    }
});

test("a role whose model the owner took off the list shows as not allowed", async () => {
    const api = await routes([]);
    try {
        const data = (await api.get("roles")) as { roles: Recorded[]; models: Recorded[] };

        assert.equal(data.roles[0].allowed, false);
        assert.deepEqual(data.models, []);
    } finally {
        await rm(api.dir, { recursive: true });
    }
});

test("a pick writes the model into the profile and changes no other line", async () => {
    const api = await routes([WORKER_MODEL, "openai/gpt-6.1-sol"]);
    try {
        const data = (await api.post("model", { name: "worker", model: "openai/gpt-6.1-sol" })) as {
            roles: Recorded[];
        };

        assert.equal(data.roles[0].model, "openai/gpt-6.1-sol");
        assert.equal(
            await readFile(join(api.dir, "agents", "worker.md"), "utf8"),
            WORKER.replace(`model: ${WORKER_MODEL}`, 'model: "openai/gpt-6.1-sol"'),
        );
    } finally {
        await rm(api.dir, { recursive: true });
    }
});

test("a profile without a model line gets one, and clearing it removes the line", async () => {
    const api = await routes([WORKER_MODEL]);
    try {
        await writeFile(join(api.dir, "agents", "reviewer.md"), NO_MODEL);
        await api.post("model", { name: "reviewer", model: WORKER_MODEL });

        assert.equal(
            await readFile(join(api.dir, "agents", "reviewer.md"), "utf8"),
            NO_MODEL.replace("---\n", `---\nmodel: "${WORKER_MODEL}"\n`),
        );

        await api.post("model", { name: "reviewer", model: null });

        assert.equal(await readFile(join(api.dir, "agents", "reviewer.md"), "utf8"), NO_MODEL);
    } finally {
        await rm(api.dir, { recursive: true });
    }
});

test("a model the owner did not allow, and a name outside the folder, never reach a file", async () => {
    const api = await routes();
    try {
        await assert.rejects(
            api.post("model", { name: "worker", model: "openai/gpt-6.1-sol" }),
            /openai\/gpt-6\.1-sol is not one of the models for subagents/,
        );
        for (const name of ["../worker", "worker/../worker", "nobody"]) {
            await assert.rejects(api.post("model", { name, model: WORKER_MODEL }), /No such role|ENOENT/);
        }

        assert.equal(await readFile(join(api.dir, "agents", "worker.md"), "utf8"), WORKER);
    } finally {
        await rm(api.dir, { recursive: true });
    }
});
