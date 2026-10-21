// The Git history module: its routes read the session folder's commits and one commit's diff. Run it with
// `node --test git-history.test.ts` in the drop-in folder.
import {
    cleanUp,
    newSession,
    openApp,
    owner,
    root,
    scriptedModel,
} from "/Users/vantuh/projects/opensource-test/pi-pocket/test/helpers.ts";
import { createHandler } from "/Users/vantuh/projects/opensource-test/pi-pocket/src/server/http.ts";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { join } from "node:path";
import { after, before, test } from "node:test";

const dataDir = join(root, "data");
const dropIns = join(dataDir, "extensions");
const project = join(root, "project");
const origin = join(root, "origin.git");
const plain = join(root, "plain");

let app: Awaited<ReturnType<typeof openApp>>;
let server: Server;
let base = "";
let id: number;
let plainId: number;
let guestToken = "";

before(async () => {
    mkdirSync(dropIns, { recursive: true });
    // As in the data folder: the module is a link to where it lives, and its browser module is beside it. The diff
    // renderer is not copied: the module finds it beside its real file.
    symlinkSync(join(import.meta.dirname, "git-history.ts"), join(dropIns, "git-history.ts"));
    cpSync(join(import.meta.dirname, "history-ui"), join(dropIns, "history-ui"), {
        recursive: true,
    });

    const identity = {
        GIT_AUTHOR_NAME: "Tess",
        GIT_AUTHOR_EMAIL: "tess@example.com",
        GIT_COMMITTER_NAME: "Tess",
        GIT_COMMITTER_EMAIL: "tess@example.com",
    };
    const git = (...args: string[]) =>
        execFileSync("git", args, {
            cwd: project,
            stdio: "pipe",
            env: { ...process.env, ...identity },
        });

    mkdirSync(project, { recursive: true });
    mkdirSync(plain, { recursive: true });
    git("init", "-q", "-b", "main");
    writeFileSync(join(project, "a.txt"), "one\n");
    git("add", ".");
    git("commit", "-q", "-m", "first commit");
    writeFileSync(join(project, "a.txt"), "one\ntwo\n");
    git("commit", "-q", "-am", "second commit");
    // A remote with the two commits, and a third one that is not pushed yet.
    execFileSync("git", ["init", "--bare", "-q", origin], { stdio: "pipe" });
    git("remote", "add", "origin", origin);
    git("push", "-q", "-u", "origin", "main");
    writeFileSync(join(project, "a.txt"), "one\ntwo\nthree\n");
    git("commit", "-q", "-am", "third commit");

    app = await openApp(scriptedModel(), dataDir);
    server = createServer(
        createHandler({ app, listen: { host: "127.0.0.1", port: 0 }, restart: () => {} }),
    );
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

    guestToken = app.config.addUser("Gale", "guest").token;
    await app.setExtensionEnabled(owner(app), "git-history.ts", true);
    id = await newSession(app, project);
    plainId = await newSession(app, plain);
});

after(async () => {
    server?.closeAllConnections();
    server?.close();
    await app?.close();
    cleanUp();
});

/** A POST as the owner. */
async function post(path: string) {
    const response = await fetch(`${base}${path}`, {
        method: "POST",
        headers: {
            authorization: `Bearer ${app.config.ownerToken}`,
            "x-pocket": "1",
            "content-type": "application/json",
        },
        body: "{}",
    });

    return { status: response.status, data: (await response.json()) as Record<string, unknown> };
}

/** A route call as the owner, or as Gale with `asGuest`. */
async function call(path: string, asGuest = false) {
    const response = await fetch(`${base}${path}`, {
        headers: {
            authorization: `Bearer ${asGuest ? guestToken : app.config.ownerToken}`,
            "x-pocket": "1",
        },
    });

    return { status: response.status, data: (await response.json()) as Record<string, unknown> };
}

test("the log route lists the session folder's commits, newest first, and how far they are unpushed", async () => {
    const { status, data } = await call(`/api/x/git-history/log/${id}`);
    const commits = data.commits as { subject: string; hash: string }[];

    assert.equal(status, 200);
    assert.equal(data.branch, "main");
    assert.equal(data.upstream, "origin/main");
    assert.equal(data.ahead, 1);
    assert.equal(data.behind, 0);
    assert.deepEqual(
        commits.map((commit) => commit.subject),
        ["third commit", "second commit", "first commit"],
    );
    assert.match(commits[0]!.hash, /^[0-9a-f]{40}$/);
});

test("the commit route shows one commit's files, each with the diff that @pierre/diffs drew", async () => {
    const log = await call(`/api/x/git-history/log/${id}`);
    const hash = (log.data.commits as { hash: string; subject: string }[]).find(
        (commit) => commit.subject === "second commit",
    )!.hash;
    const { status, data } = await call(`/api/x/git-history/commit/${id}/${hash}?theme=dark&style=split`);
    const files = data.files as {
        path: string;
        added: number;
        removed: number;
        html: string;
        error: string;
    }[];

    assert.equal(status, 200);
    assert.equal(data.subject, "second commit");
    assert.equal(files.length, 1);
    assert.equal(files[0]!.path, "a.txt");
    assert.equal(files[0]!.added, 1);
    assert.equal(files[0]!.removed, 0);
    assert.equal(files[0]!.error, "");
    // The renderer's own markup: the diff root and the styles for a shadow root.
    assert.match(files[0]!.html, /data-diffs/);
    assert.match(files[0]!.html, /data-core-css/);
    assert.match(files[0]!.html, />two</);
});

test("track says how far the branch is ahead, and push sends the commits", async () => {
    const track = await call(`/api/x/git-history/track/${id}`);

    assert.equal(track.status, 200);
    assert.equal(track.data.upstream, "origin/main");
    assert.equal(track.data.ahead, 1);
    assert.equal(track.data.behind, 0);

    const pushed = await post(`/api/x/git-history/push/${id}`);

    assert.equal(pushed.status, 200, JSON.stringify(pushed.data));
    assert.equal(pushed.data.pushed, 1);
    assert.equal(pushed.data.ahead, 0);
    assert.equal((await call(`/api/x/git-history/track/${id}`)).data.ahead, 0);

    const onRemote = execFileSync("git", ["--git-dir", origin, "log", "--format=%s", "main"], {
        encoding: "utf8",
    })
        .trim()
        .split("\n");

    assert.deepEqual(onRemote, ["third commit", "second commit", "first commit"]);
});

test("a commit id that is not one, and a folder outside a repository, get 400 with the reason", async () => {
    assert.equal((await call(`/api/x/git-history/commit/${id}/nope`)).status, 400);

    const outside = await call(`/api/x/git-history/log/${plainId}`);

    assert.equal(outside.status, 400);
    assert.match(String(outside.data.error), /not a git repository/);
});

test("someone who cannot see the session cannot read its history", async () => {
    assert.equal((await call(`/api/x/git-history/log/${id}`, true)).status, 404);
});
