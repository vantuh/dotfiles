import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import createSubagentRoles from "./subagent-roles.ts";
import type { Host } from "./_pocket.d.ts";

type Recorded = Record<string, unknown>;

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

/** The tools that a Pi Pocket session offers. */
const OFFERED = ["read", "write", "edit", "bash"];

/** Runs the wrapped subagent tool with a fake one that records the arguments that reach it. */
async function call(agentDir: string, args: Recorded, allowed: string[] = [WORKER_MODEL]): Promise<Recorded> {
    const host = {
        agentDir,
        thinkingLevels: ["off", "minimal", "low", "medium", "high", "xhigh", "max"],
        subagentModels: () => allowed,
    } as unknown as Host;
    const [wrap] = createSubagentRoles(host).wraps ?? [];
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

test("what Pi chose wins over the role's tools and thinking", async () => {
    const dir = await profiles();
    try {
        const seen = await call(dir, {
            action: "spawn",
            name: "worker",
            message: "fix the bug",
            tools: ["bash"],
            thinking: "low",
        });

        assert.deepEqual(seen.tools, ["bash"]);
        assert.equal(seen.thinking, "low");
        assert.equal(seen.message, "You are worker: the implementation subagent.\n\n## Your task\n\nfix the bug");
    } finally {
        await rm(dir, { recursive: true });
    }
});

test("a role's model that the owner did not allow is left out, and the subagent is told", async () => {
    const dir = await profiles();
    try {
        const seen = await call(dir, { action: "spawn", name: "worker", message: "fix the bug" }, []);

        assert.equal(seen.model, undefined);
        assert.match(
            String(seen.message),
            /Your role's model openrouter\/deepseek\/deepseek-v4\.1-flash-1017 is not allowed for subagents here/,
        );
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
