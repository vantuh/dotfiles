// The Git history module: its routes read the session folder's commits and one commit's diff. Run it with
// `node --test git-history.test.ts` in the drop-in folder.
import {
    cleanUp,
    newSession,
    openApp,
    owner,
    root,
    scriptedModel,
    until,
} from "/Users/vantuh/projects/opensource-test/pi-pocket/test/helpers.ts";
import { createHandler } from "/Users/vantuh/projects/opensource-test/pi-pocket/src/server/http.ts";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { join } from "node:path";
import { after, before, test } from "node:test";

const dataDir = join(root, "data");
const dropIns = join(dataDir, "extensions");
const project = join(root, "project");
const origin = join(root, "origin.git");
const plain = join(root, "plain");
const merged = join(root, "merged");

let app: Awaited<ReturnType<typeof openApp>>;
let server: Server;
let base = "";
let id: number;
let plainId: number;
let mergedId: number;
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

    // A repository whose newest commit is a merge: its patch is what it brought to its first parent.
    mkdirSync(merged, { recursive: true });
    const mergeGit = (...args: string[]) =>
        execFileSync("git", args, { cwd: merged, stdio: "pipe", env: { ...process.env, ...identity } });

    mergeGit("init", "-q", "-b", "main");
    writeFileSync(join(merged, "m.txt"), "base\n");
    mergeGit("add", ".");
    mergeGit("commit", "-q", "-m", "base");
    mergeGit("checkout", "-q", "-b", "side");
    writeFileSync(join(merged, "side.txt"), "side\n");
    mergeGit("add", ".");
    mergeGit("commit", "-q", "-m", "side work");
    mergeGit("checkout", "-q", "main");
    writeFileSync(join(merged, "main.txt"), "main\n");
    mergeGit("add", ".");
    mergeGit("commit", "-q", "-m", "main work");
    mergeGit("merge", "-q", "--no-ff", "side", "-m", "merge side");

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
    mergedId = await newSession(app, merged);
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

/** Runs `run` with `PATH` set to `path`, and puts the old one back afterwards. */
async function withPath(path: string, run: () => Promise<void>) {
    const before = process.env.PATH;

    process.env.PATH = path;

    try {
        await run();
    } finally {
        if (before === undefined) {
            delete process.env.PATH;
        } else {
            process.env.PATH = before;
        }
    }
}

/** A fake review tool in a folder of its own: it keeps the patch it reads, waits, and answers as Plannotator does. */
function fakeTool(heard: string): string {
    const bin = join(root, `fake-bin-${Math.random().toString(36).slice(2)}`);

    mkdirSync(bin, { recursive: true });
    writeFileSync(
        join(bin, "plannotator"),
        `#!/bin/sh\ncat > "${heard}"\nsleep 0.5\nprintf '%s' '{"decision":"annotated","message":"# Code Review Feedback\\n\\n- one"}'\n`,
        { mode: 0o755 },
    );

    return bin;
}

test("the log route lists the session folder's commits, newest first, and how far they are unpushed", async () => {
    const { status, data } = await call(`/api/x/git-history/log/${id}`);
    const commits = data.commits as { subject: string; hash: string }[];

    assert.equal(status, 200);
    assert.equal(data.branch, "main");
    assert.equal(data.upstream, "origin/main");
    assert.equal(data.ahead, 1);
    assert.equal(data.behind, 0);
    assert.equal(data.changes, 0);
    assert.deepEqual(
        commits.map((commit) => commit.subject),
        ["third commit", "second commit", "first commit"],
    );
    assert.match(commits[0]!.hash, /^[0-9a-f]{40}$/);
    // The third commit is the only one that waits to be pushed.
    assert.deepEqual(
        commits.map((commit) => (commit as { unpushed?: boolean }).unpushed ?? false),
        [true, false, false],
    );
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

test("a commit that is only on the remote comes first, marked as not pulled", async () => {
    const other = join(root, "other");

    execFileSync("git", ["clone", "-q", origin, other], { stdio: "pipe" });
    execFileSync(
        "git",
        [
            "-C",
            other,
            "-c",
            "user.name=Other",
            "-c",
            "user.email=other@example.com",
            "commit",
            "-q",
            "--allow-empty",
            "-m",
            "remote work",
        ],
        { stdio: "pipe" },
    );
    execFileSync("git", ["-C", other, "push", "-q", "origin", "main"], { stdio: "pipe" });
    execFileSync("git", ["-C", project, "fetch", "-q"], { stdio: "pipe" });

    const { data } = await call(`/api/x/git-history/log/${id}`);
    const commits = data.commits as { subject: string; remote?: boolean; unpushed?: boolean }[];

    assert.equal(data.behind, 1);
    assert.equal(data.ahead, 0);
    assert.equal(commits[0]!.subject, "remote work");
    assert.equal(commits[0]!.remote, true);
    assert.equal(commits[1]!.remote ?? false, false);
    assert.equal(commits[1]!.unpushed ?? false, false);
});

test("a commit id that is not one, and a folder outside a repository, get 400 with the reason", async () => {
    assert.equal((await call(`/api/x/git-history/commit/${id}/nope`)).status, 400);

    const outside = await call(`/api/x/git-history/log/${plainId}`);

    assert.equal(outside.status, 400);
    assert.match(String(outside.data.error), /not a git repository/);
});

test("the uncommitted work is the changes against the last commit, and each new file", async () => {
    writeFileSync(join(project, "a.txt"), "one\ntwo\nthree\nfour\n");
    writeFileSync(join(project, "b.txt"), "fresh\nlines\n");

    const { status, data } = await post(`/api/x/git-history/worktree/${id}`);
    const files = data.files as { path: string; kind: string; added: number; html: string }[];

    assert.equal(status, 200);
    assert.deepEqual(
        files.map((file) => file.path),
        ["a.txt", "b.txt"],
    );
    assert.equal(files[0]!.added, 1);
    assert.equal(files[1]!.added, 2);
    assert.equal(data.added, 3);
    assert.equal(data.removed, 0);
    assert.deepEqual(data.left, []);
    assert.match(files[1]!.html, /fresh/);

    // The log counts the same work, so the page can show the row for it.
    assert.equal((await call(`/api/x/git-history/log/${id}`)).data.changes, 2);

    // Outside a repository there is no uncommitted work to speak of.
    assert.equal((await post(`/api/x/git-history/worktree/${plainId}`)).status, 400);
});

test("someone who cannot see the session cannot read its history", async () => {
    assert.equal((await call(`/api/x/git-history/log/${id}`, true)).status, 404);
});

test("the review route sends the patch to Plannotator, and the page reads its answer", async () => {
    const heard = join(root, "review-patch.diff");
    const bin = fakeTool(heard);
    const before = process.env.PATH;

    writeFileSync(join(project, "a.txt"), "one\ntwo\nthree\nfour\nfive\n");
    writeFileSync(join(project, "c.txt"), "untouched\n");

    await withPath(`${bin}:${before ?? ""}`, async () => {
        const started = await post(`/api/x/git-history/review/${id}/worktree`);

        assert.equal(started.status, 200, JSON.stringify(started.data));
        assert.deepEqual(started.data, { ok: true });
        assert.equal(
            (await call(`/api/x/git-history/review/${id}/worktree`)).data.state,
            "running",
        );

        const review = () =>
            call(`/api/x/git-history/review/${id}/worktree`).then((answer) => answer.data);

        await until(async () => (await review()).state !== "running", "the review's answer");

        const done = await review();

        assert.equal(done.state, "done");
        assert.equal(done.decision, "annotated");
        assert.equal(done.message, "# Code Review Feedback\n\n- one");
    });

    // The tool read the patch on its stdin: the change to the tracked file, and the new one.
    const patch = readFileSync(heard, "utf8");

    assert.match(patch, /diff --git a\/a\.txt b\/a\.txt/);
    assert.match(patch, /\+five/);
    assert.match(patch, /diff --git a\/c\.txt b\/c\.txt/);
    assert.match(patch, /\+untouched/);
});

test("a merge commit's review gets what it brought to its first parent", async () => {
    const heard = join(root, "review-merge.diff");
    const bin = fakeTool(heard);
    const before = process.env.PATH;
    const hash = execFileSync("git", ["rev-parse", "HEAD"], { cwd: merged, encoding: "utf8" }).trim();

    await withPath(`${bin}:${before ?? ""}`, async () => {
        const started = await post(`/api/x/git-history/review/${mergedId}/${hash}`);

        assert.deepEqual(started.data, { ok: true });

        const review = () =>
            call(`/api/x/git-history/review/${mergedId}/${hash}`).then((answer) => answer.data);

        await until(async () => (await review()).state !== "running", "the review's answer");
        assert.equal((await review()).state, "done");
    });

    // `git show` prints nothing for a merge: the patch is the side branch's file, not the work already on main.
    const patch = readFileSync(heard, "utf8");

    assert.match(patch, /diff --git a\/side\.txt b\/side\.txt/);
    assert.doesNotMatch(patch, /diff --git a\/main\.txt/);
});

test("a missing review tool is a failure that names Plannotator", async () => {
    // Git still needs a folder on PATH: this one has it, and no review tool.
    await withPath("/usr/bin:/bin", async () => {
        const started = await post(`/api/x/git-history/review/${id}/worktree`);

        assert.equal(started.status, 200, JSON.stringify(started.data));

        const review = () =>
            call(`/api/x/git-history/review/${id}/worktree`).then((answer) => answer.data);

        await until(async () => (await review()).state === "failed", "the review's failure");

        assert.match(String((await review()).error), /Plannotator/);
    });
});

test("a folder with nothing to review answers at once, and starts no tool", async () => {
    const clean = join(root, "clean");

    mkdirSync(clean, { recursive: true });
    execFileSync("git", ["init", "-q", "-b", "main", clean], { stdio: "pipe" });

    const cleanId = await newSession(app, clean);
    const { status, data } = await post(`/api/x/git-history/review/${cleanId}/worktree`);

    assert.equal(status, 200);
    assert.deepEqual(data, { state: "failed", error: "There is nothing to review." });
    assert.deepEqual((await call(`/api/x/git-history/review/${cleanId}/worktree`)).data, {
        state: "failed",
        error: "There is nothing to review.",
    });
});
