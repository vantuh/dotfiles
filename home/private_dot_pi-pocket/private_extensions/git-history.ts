/**
 * Git history: lists the commits of the session's folder, newest first, and shows the diff of each one, beside the
 * app's own Changes and Branch views. Each file's diff is rendered by `@pierre/diffs` (`lib/pierre-ssr.js`).
 */
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { stat } from "node:fs/promises";
import { join } from "node:path";
// In the drop-in folder, the types come from "./_pocket.d.ts".
import type { Web } from "./_pocket.d.ts";

/** The most commits a page reads, and the number it reads by default. */
const MAX_COMMITS = 200;
const DEFAULT_COMMITS = 50;
/** Past this much patch in a commit, the files that are left are named but not rendered: a page cannot draw more. */
const MAX_PATCH_CHARS = 300_000;
const GIT_TIMEOUT_MS = 15_000;
/** A push, or a fetch, talks to a server: it gets longer, and it never waits for a password at a terminal. */
const GIT_REMOTE_TIMEOUT_MS = 120_000;
const MAX_BUFFER = 32 * 1024 * 1024;

/** A commit's short fields, each ended by a NUL, and the record by a RS. A subject is text, so it can hold anything. */
const LOG_FORMAT = "%H%x00%h%x00%an%x00%at%x00%s%x00%b%x1e";
const SHOW_FORMAT = "%H%x00%h%x00%an%x00%ae%x00%at%x00%P%x00%s%x00%b";
/** An untracked file over this size is named but not read: the page cannot draw it, and its patch is not worth it. */
const MAX_UNTRACKED_BYTES = 2 * 1024 * 1024;

/** The review tool: it opens the diff in the browser, and blocks until the person approves, writes, or closes. */
const REVIEW_TOOL = "plannotator";
/** The target of the uncommitted work in a review's address; a commit's own target is its hash. */
const REVIEW_WORKTREE = "worktree";
const REVIEW_STOP_MS = 2_000;

type Kind = "modified" | "added" | "deleted" | "renamed";

/** One commit in the list: `unpushed` when it is only here, `remote` when it is only on the remote branch. */
type Logged = {
    hash: string;
    short: string;
    author: string;
    at: number;
    subject: string;
    body: string;
    unpushed?: boolean;
    remote?: boolean;
};

type FilePatch = {
    patch: string;
    path: string;
    oldPath: string;
    kind: Kind;
    added: number;
    removed: number;
    binary: boolean;
};

type Pierre = typeof import("./lib/pierre-ssr.js");
type DiffOptions = NonNullable<Parameters<Pierre["preloadPatchDiff"]>[0]["options"]>;

type Decision = "approved" | "annotated" | "dismissed";

/** One review: the tool is working, or it has answered, or it could not run. */
type Review =
    | { state: "running"; child: ChildProcess }
    | { state: "done"; decision: Decision; message: string }
    | { state: "failed"; error: string };

/** The reviews of each conversation, by the target they open: one tool at a time for a conversation. */
const reviews = new Map<number, Map<string, Review>>();

/** The renderer is a bundle of `@pierre/diffs`, about 10 MB: read it when a commit is first opened, not at startup. */
let renderer: Promise<Pierre> | undefined;

async function loadRenderer(): Promise<Pierre> {
    renderer ??= import("./lib/pierre-ssr.js");

    try {
        return await renderer;
    } catch (failure) {
        renderer = undefined;
        throw failure;
    }
}

/**
 * Runs git, and gives its output. `allow` names exit codes that mean an answer, not a failure: `git diff --no-index`
 * exits 1 when the two files differ, which is what it was asked for.
 */
function git(cwd: string, args: string[], timeoutMs = GIT_TIMEOUT_MS, allow: number[] = []): Promise<string> {
    return new Promise((resolve, reject) => {
        execFile(
            "git",
            ["--no-pager", ...args],
            {
                cwd,
                timeout: timeoutMs,
                maxBuffer: MAX_BUFFER,
                windowsHide: true,
                env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
            },
            (failure, stdout, stderr) => {
                if (failure === null) {
                    resolve(stdout);
                } else if (allow.includes((failure as { code?: number }).code ?? -1)) {
                    resolve(stdout);
                } else {
                    reject(new Error(`${stderr}`.trim() || failure.message));
                }
            },
        );
    });
}

/** Git's own words for a failure, as the page shows them. */
function gitOrFail(
    web: Web,
    cwd: string,
    args: string[],
    timeoutMs = GIT_TIMEOUT_MS,
): Promise<string> {
    return git(cwd, args, timeoutMs).catch((failure: unknown) => {
        throw web.error(400, failure instanceof Error ? failure.message : String(failure));
    });
}

/** A path from a `---` or `+++` line: without its `a/` or `b/`, or null for `/dev/null`. */
function pathOf(line: string): string | null {
    const path = line
        .replace(/\t.*$/, "")
        .trim()
        .replace(/^"(.*)"$/, "$1");

    return path === "/dev/null" ? null : path.replace(/^[ab]\//, "");
}

/** A unified diff as its files, with the state and the counts that the page's header shows. */
function splitPatch(diff: string): FilePatch[] {
    const files: FilePatch[] = [];
    let current: FilePatch | null = null;
    let inHunk = false;

    for (const line of diff.split("\n")) {
        if (line.startsWith("diff --git ")) {
            current = {
                patch: `${line}\n`,
                path: "",
                oldPath: "",
                kind: "modified",
                added: 0,
                removed: 0,
                binary: false,
            };
            files.push(current);
            inHunk = false;
            continue;
        }

        if (current === null) {
            continue;
        }

        current.patch += `${line}\n`;

        if (line.startsWith("@@")) {
            inHunk = true;
        } else if (inHunk) {
            if (line.startsWith("+")) {
                current.added++;
            } else if (line.startsWith("-")) {
                current.removed++;
            }
        } else if (line.startsWith("--- ")) {
            const path = pathOf(line.slice(4));

            if (path === null) {
                current.kind = "added";
            } else {
                current.oldPath = path;
            }
        } else if (line.startsWith("+++ ")) {
            const path = pathOf(line.slice(4));

            if (path === null) {
                current.kind = "deleted";
            } else {
                current.path = path;
            }
        } else if (line.startsWith("new file mode")) {
            current.kind = "added";
        } else if (line.startsWith("deleted file mode")) {
            current.kind = "deleted";
        } else if (line.startsWith("rename from ")) {
            current.kind = "renamed";
            current.oldPath = line.slice(12).trim();
        } else if (line.startsWith("rename to ")) {
            current.kind = "renamed";
            current.path = line.slice(10).trim();
        } else if (line.startsWith("Binary files ") || line === "GIT binary patch") {
            current.binary = true;
        }
    }

    for (const file of files) {
        file.path ||= file.oldPath;

        if (file.kind === "modified" && file.oldPath !== "" && file.oldPath !== file.path) {
            file.kind = "renamed";
        }
    }

    return files;
}

/** The commits of a `--format=${LOG_FORMAT}` log, newest first. */
function parseLog(output: string): Logged[] {
    return output
        .split("\x1e")
        .map((record) => record.replace(/^\n/, "").replace(/\n$/, ""))
        .filter((record) => record !== "")
        .map((record) => {
            const [hash = "", short = "", author = "", at = "", subject = "", body = ""] = record.split("\0");

            return { hash, short, author, at: Number(at) * 1000, subject, body: body.trim() };
        });
}

/** Each file of a patch, with its diff as HTML. */
async function filesOf(patch: string, options: DiffOptions) {
    const { preloadPatchDiff } = await loadRenderer();
    const files = [];
    let used = 0;

    for (const file of splitPatch(patch.replace(/^\n/, ""))) {
        const drawn = {
            path: file.path,
            oldPath: file.oldPath,
            kind: file.kind,
            added: file.added,
            removed: file.removed,
            binary: file.binary,
            html: "",
            skipped: false,
            error: "",
        };

        if (!file.binary) {
            if (used + file.patch.length > MAX_PATCH_CHARS) {
                drawn.skipped = true;
            } else {
                used += file.patch.length;

                try {
                    drawn.html = (await preloadPatchDiff({ patch: file.patch, options })).prerenderedHTML;
                } catch (failure) {
                    drawn.error = failure instanceof Error ? failure.message : String(failure);
                }
            }
        }

        files.push(drawn);
    }

    return files;
}

/**
 * The folder's uncommitted work as one patch: the changes to tracked files against the last commit, then each untracked
 * file as a new one. A folder with no commit yet compares what is staged instead. `left` names what was too big.
 */
async function worktreePatch(web: Web, cwd: string) {
    const inside = await git(cwd, ["rev-parse", "--is-inside-work-tree"]).then(
        (answer) => answer.trim() === "true",
        () => false,
    );

    if (!inside) {
        throw web.error(400, "This folder is not a git repository.");
    }

    const head = await git(cwd, ["rev-parse", "--verify", "--quiet", "HEAD"]).then(
        () => true,
        () => false,
    );
    const tracked = await gitOrFail(web, cwd, [
        "diff",
        "--no-color",
        "--find-renames",
        ...(head ? ["HEAD"] : ["--cached"]),
    ]);
    const untracked = (
        await gitOrFail(web, cwd, ["ls-files", "--others", "--exclude-standard", "-z"])
    )
        .split("\0")
        .filter((path) => path !== "")
        .sort();
    const parts = [tracked];
    const left: string[] = [];

    for (const path of untracked) {
        const size = await stat(join(cwd, path)).then(
            (info) => info.size,
            () => 0,
        );

        if (size > MAX_UNTRACKED_BYTES) {
            left.push(path);
            continue;
        }

        parts.push(
            await git(
                cwd,
                ["diff", "--no-index", "--no-color", "--", "/dev/null", path],
                GIT_TIMEOUT_MS,
                [1],
            ),
        );
    }

    return { patch: parts.join(""), left };
}

/** The folder's uncommitted work: its files, each with its diff as HTML. */
async function worktreeOf(web: Web, cwd: string, options: DiffOptions) {
    const { patch, left } = await worktreePatch(web, cwd);
    const files = await filesOf(patch, options);

    return {
        files,
        added: files.reduce((sum, file) => sum + file.added, 0),
        removed: files.reduce((sum, file) => sum + file.removed, 0),
        left,
        omitted: files.filter((file) => file.skipped).length,
    };
}

/** The patch text of a review's target, without rendering it: the uncommitted work, or one commit. */
async function patchOf(web: Web, cwd: string, target: string): Promise<string> {
    if (target === REVIEW_WORKTREE) {
        return (await worktreePatch(web, cwd)).patch;
    }

    if (!/^[0-9a-f]{4,64}$/i.test(target)) {
        throw web.error(400, "Not a commit id.");
    }

    const meta = await gitOrFail(web, cwd, ["show", "-s", "--format=%H%x00%P", target]);
    const [full = "", parents = ""] = meta.trim().split("\0");

    return commitPatch(web, cwd, full, parents.split(" ").filter((parent) => parent !== ""));
}

/** How many files the folder has changed, staged or not, and untracked ones too. */
function changesOf(status: string): number {
    const entries = status.split("\0").filter((entry) => entry !== "");
    let count = 0;

    for (let index = 0; index < entries.length; index++) {
        const entry = entries[index]!;

        count++;

        // A rename or a copy is two records: its old path follows it.
        if (entry.startsWith("R") || entry.startsWith("C")) {
            index++;
        }
    }

    return count;
}

/** How far the checked-out branch is from the remote branch it follows: `{}` when it follows none. */
async function trackOf(cwd: string): Promise<{ upstream?: string; ahead?: number; behind?: number }> {
    const upstream = await git(cwd, [
        "rev-parse",
        "--abbrev-ref",
        "--symbolic-full-name",
        "@{upstream}",
    ]).then(
        (name) => name.trim(),
        () => "",
    );

    if (upstream === "") {
        return {};
    }

    // `HEAD...@{upstream}`: the commits HEAD has and the remote branch has not, then the others.
    const counts = await git(cwd, ["rev-list", "--left-right", "--count", "HEAD...@{upstream}"]).then(
        (text) => text.trim(),
        () => "",
    );
    const [ahead = "", behind = ""] = counts.split(/\s+/);

    if (ahead === "" || behind === "") {
        return { upstream };
    }

    return { upstream, ahead: Number(ahead), behind: Number(behind) };
}

/** The folder's commits, newest first, and whether there are more than the page shows. */
async function logOf(web: Web, cwd: string, limit: number) {
    const [branch, track, changes] = await Promise.all([
        git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]).then(
            (name) => name.trim(),
            () => "",
        ),
        trackOf(cwd),
        git(cwd, ["status", "--porcelain=v1", "-z"]).then(
            (status) => changesOf(status),
            () => 0,
        ),
    ]);
    let output: string;

    try {
        output = await git(cwd, ["log", "-n", `${limit + 1}`, "--date=unix", `--format=${LOG_FORMAT}`]);
    } catch (failure) {
        const words = failure instanceof Error ? failure.message : String(failure);

        // A repository with no commit yet is empty, not broken.
        if (/does not have any commits yet/.test(words)) {
            return { branch, ...track, changes, commits: [], more: 0 };
        }

        throw web.error(400, words);
    }

    const commits = parseLog(output);
    // What the branch has and its remote does not is the newest part of its history: a linear branch, and the first
    // commits of the list for a branch with merges too.
    for (const [index, commit] of commits.entries()) {
        if (index < (track.ahead ?? 0)) {
            commit.unpushed = true;
        }
    }

    let remote: Logged[] = [];

    if (track.upstream !== undefined && (track.behind ?? 0) > 0) {
        remote = parseLog(
            await git(cwd, [
                "log",
                "-n",
                `${limit}`,
                "--date=unix",
                `--format=${LOG_FORMAT}`,
                "@{upstream}",
                "--not",
                "HEAD",
            ]).catch(() => ""),
        );

        for (const commit of remote) {
            commit.remote = true;
        }
    }

    return {
        branch,
        ...track,
        changes,
        // The remote branch's commits the folder has not pulled come first: they are newer than what it has.
        commits: [...remote, ...commits.slice(0, limit)],
        more: Math.max(0, commits.length - limit),
    };
}

/** A commit's patch: a merge shows what it brought to its first parent, as GitHub's own view does; a root shows all. */
function commitPatch(web: Web, cwd: string, full: string, parents: string[]): Promise<string> {
    return parents.length > 0
        ? gitOrFail(web, cwd, ["diff", "--no-color", "--find-renames", parents[0]!, full])
        : gitOrFail(web, cwd, ["show", "--no-color", "--format=", "--patch", full]);
}

/** One commit: who wrote it, when, what it says, and its files, each with its diff as HTML. */
async function commitOf(web: Web, cwd: string, hash: string, options: DiffOptions) {
    const meta = await gitOrFail(web, cwd, ["show", "-s", "--date=unix", `--format=${SHOW_FORMAT}`, hash]);
    const [
        full = "",
        short = "",
        author = "",
        email = "",
        at = "",
        parents = "",
        subject = "",
        body = "",
    ] = meta.split("\0");
    const before = parents.split(" ").filter((parent) => parent !== "");
    const patch = await commitPatch(web, cwd, full, before);
    const files = await filesOf(patch, options);

    return {
        hash: full,
        short,
        author,
        email,
        at: Number(at) * 1000,
        subject,
        body: body.trim(),
        parents: before,
        files,
        omitted: files.filter((file) => file.skipped).length,
    };
}

/** `git commit-tree` with the message on its stdin: it gives the new commit's id. */
function commitTree(cwd: string, args: string[], message: string, env: NodeJS.ProcessEnv): Promise<string> {
    return new Promise((resolve, reject) => {
        const child = execFile(
            "git",
            ["commit-tree", ...args, "-F", "-"],
            { cwd, timeout: GIT_TIMEOUT_MS, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: "0", ...env } },
            (failure, stdout, stderr) => {
                if (failure === null) {
                    resolve(stdout.trim());
                } else {
                    reject(new Error(`${stderr}`.trim() || failure.message));
                }
            },
        );

        child.stdin?.end(message);
    });
}

/**
 * Gives a commit a new message, and writes again each commit after it on the branch, with the same trees, authors, and
 * messages. The index and the files are not touched: no tree changes. A commit on the remote branch is refused, since a
 * plain push could not send the new history.
 */
async function reword(web: Web, cwd: string, hash: string, message: string) {
    const target = (await gitOrFail(web, cwd, ["rev-parse", "--verify", `${hash}^{commit}`])).trim();
    const head = (await gitOrFail(web, cwd, ["rev-parse", "--verify", "HEAD"])).trim();
    const onBranch = (ref: string) =>
        git(cwd, ["merge-base", "--is-ancestor", target, ref]).then(
            () => true,
            () => false,
        );

    if (!(await onBranch("HEAD"))) {
        throw web.error(400, "Only a commit of the checked-out branch can be edited.");
    }

    if ((await trackOf(cwd)).upstream !== undefined && (await onBranch("@{upstream}"))) {
        throw web.error(400, "This commit is pushed already: its message cannot change here.");
    }

    const sign = await git(cwd, ["config", "--bool", "commit.gpgsign"]).then(
        (value) => value.trim() === "true",
        () => false,
    );
    const after = (
        await gitOrFail(web, cwd, ["rev-list", "--reverse", "--topo-order", "--ancestry-path", "--parents", `${target}..${head}`])
    )
        .split("\n")
        .filter((line) => line !== "");
    const parentsOf = async (commit: string) =>
        (await gitOrFail(web, cwd, ["show", "-s", "--format=%P", commit])).trim().split(" ").filter((p) => p !== "");
    const renamed = new Map<string, string>();

    for (const [commit, parents, text] of [
        [target, await parentsOf(target), message] as const,
        ...after.map((line) => {
            const [commit = "", ...parents] = line.split(" ");

            return [commit, parents, null] as const;
        }),
    ]) {
        const [tree = "", name = "", email = "", date = "", body = ""] = (
            await gitOrFail(web, cwd, ["show", "-s", "--date=raw", "--format=%T%x00%an%x00%ae%x00%ad%x00%B", commit])
        ).split("\0");
        const made = await commitTree(
            cwd,
            [tree, ...parents.flatMap((parent) => ["-p", renamed.get(parent) ?? parent]), ...(sign ? ["-S"] : [])],
            text ?? `${body.trimEnd()}\n`,
            { GIT_AUTHOR_NAME: name, GIT_AUTHOR_EMAIL: email, GIT_AUTHOR_DATE: date },
        ).catch((failure: unknown) => {
            throw web.error(400, failure instanceof Error ? failure.message : String(failure));
        });

        renamed.set(commit, made);
    }

    // With the old id, the move fails if the branch moved while this worked. The reflog keeps the old history.
    await gitOrFail(web, cwd, ["update-ref", "-m", `git-history: reword ${target.slice(0, 7)}`, "HEAD", renamed.get(head)!, head]);

    return { hash: renamed.get(target)! };
}

/** A review as the browser reads it: the child process is not part of the answer. */
function answerOf(review: Review | undefined) {
    if (review === undefined) {
        return { state: "none" };
    }

    return review.state === "running" ? { state: "running" } : review;
}

/** Keeps a review that did not start, and gives the answer that says why. */
function failedOf(id: number, target: string, error: string) {
    const ofConversation = reviews.get(id) ?? new Map<string, Review>();

    reviews.set(id, ofConversation);
    ofConversation.set(target, { state: "failed", error });

    return { state: "failed", error };
}

/** Ends a review's tool, and gives up waiting for it after the timeout. */
function stopReview(child: ChildProcess): Promise<void> {
    return new Promise((resolve) => {
        if (child.exitCode !== null || child.signalCode !== null) {
            resolve();
            return;
        }

        const timer = setTimeout(resolve, REVIEW_STOP_MS);

        child.once("close", () => {
            clearTimeout(timer);
            resolve();
        });
        child.kill();
    });
}

/** One review's answer from the tool: one JSON record, or the reason there is none. */
function parseReview(output: string): { decision: Decision; message: string } | null {
    let answer: unknown;

    try {
        answer = JSON.parse(output.trim());
    } catch {
        return null;
    }

    const { decision, message } = (typeof answer === "object" && answer !== null ? answer : {}) as {
        decision?: unknown;
        message?: unknown;
    };

    if (decision !== "approved" && decision !== "annotated" && decision !== "dismissed") {
        return null;
    }

    return { decision, message: typeof message === "string" ? message : "" };
}

/**
 * Starts the review tool for one target: the patch goes to its stdin, and its one answer becomes the review's state.
 * A review that runs in the same conversation is ended first, so one person sees one tab at a time.
 */
function startReview(id: number, cwd: string, target: string, patch: string) {
    const ofConversation = reviews.get(id) ?? new Map<string, Review>();

    reviews.set(id, ofConversation);

    for (const [key, review] of ofConversation) {
        if (review.state === "running") {
            ofConversation.set(key, { state: "failed", error: "Another review replaced this one." });
            review.child.kill();
        }
    }

    const child = spawn(REVIEW_TOOL, ["review", "--patch-file", "-", "--json"], {
        cwd,
        env: { ...process.env, PLANNOTATOR_ORIGIN: "pi" },
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
    });
    const record: Review = { state: "running", child };
    /** Writes the state unless the review was replaced while the tool worked. */
    const settle = (next: Review) => {
        if (ofConversation.get(target) === record) {
            ofConversation.set(target, next);
        }
    };
    let stdout = "";
    let stderr = "";

    ofConversation.set(target, record);
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (text: string) => {
        stdout += text;
    });
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (text: string) => {
        stderr += text;
    });
    // The tool may stop before it reads the whole patch: that is its answer, not this module's failure.
    child.stdin?.on("error", () => {});
    child.stdin?.end(patch);

    child.on("error", (failure: NodeJS.ErrnoException) => {
        settle({
            state: "failed",
            error:
                failure.code === "ENOENT"
                    ? "Plannotator is not installed, or it is not on PATH."
                    : `Plannotator could not start: ${failure.message}`,
        });
    });

    child.on("close", (code, signal) => {
        const said = stderr.trim().slice(0, 300);

        if (code !== 0) {
            settle({
                state: "failed",
                error:
                    said !== ""
                        ? `Plannotator failed: ${said}`
                        : `Plannotator stopped without an answer (${signal ?? `exit code ${code}`}).`,
            });
            return;
        }

        const answer = parseReview(stdout);

        settle(
            answer === null
                ? { state: "failed", error: "Plannotator gave an answer that is not a review decision." }
                : { state: "done", ...answer },
        );
    });
}

export default function createGitHistory(_host: unknown, web: Web) {
    if (typeof web.conversationRoute !== "function") {
        throw new Error("git-history needs Pi Pocket 0.16.0 or later. Update it and restart the server.");
    }

    // The session's folder comes from the session itself: the browser sends no path.
    web.conversationRoute(
        "GET",
        "log/:source",
        async ({ conversation, query }) => {
            const asked = Number(query.get("limit"));
            const limit =
                Number.isFinite(asked) && asked > 0
                    ? Math.min(Math.floor(asked), MAX_COMMITS)
                    : DEFAULT_COMMITS;

            return logOf(web, conversation.cwd, limit);
        },
        { conversation: "source" },
    );

    // The top bar's count of commits not pushed: cheap enough to ask for every few seconds.
    web.conversationRoute(
        "GET",
        "track/:source",
        ({ conversation }) => trackOf(conversation.cwd),
        { conversation: "source" },
    );

    web.conversationRoute(
        "POST",
        "push/:source",
        async ({ conversation }) => {
            const before = await trackOf(conversation.cwd);

            if (before.upstream === undefined) {
                throw web.error(
                    400,
                    "This branch follows no remote branch. Push it once with -u, in a terminal.",
                );
            }

            const ahead = before.ahead ?? 0;

            if (ahead === 0) {
                return { pushed: 0, ...before };
            }

            await gitOrFail(web, conversation.cwd, ["push"], GIT_REMOTE_TIMEOUT_MS);

            return { pushed: ahead, ...(await trackOf(conversation.cwd)) };
        },
        { conversation: "source" },
    );

    web.conversationRoute(
        "GET",
        "commit/:source/:commit",
        async ({ conversation, params, query }) => {
            const hash = params.commit ?? "";

            if (!/^[0-9a-f]{4,64}$/i.test(hash)) {
                throw web.error(400, "Not a commit id.");
            }

            // The page asks for the look its theme and its width have: side by side when there is room, wrapped when not.
            const style = query.get("style") === "split" ? "split" : "unified";

            return commitOf(web, conversation.cwd, hash, {
                themeType: query.get("theme") === "light" ? "light" : "dark",
                diffStyle: style,
                overflow: style === "split" ? "scroll" : "wrap",
                hunkSeparators: "line-info",
                disableFileHeader: true,
            });
        },
        { conversation: "source" },
    );

    web.conversationRoute(
        "POST",
        "reword/:source/:commit",
        async ({ conversation, params, body }) => {
            const hash = params.commit ?? "";
            const asked = (typeof body === "object" && body !== null ? body : {}) as {
                subject?: unknown;
                body?: unknown;
            };
            const subject = typeof asked.subject === "string" ? asked.subject.trim() : "";
            const description = typeof asked.body === "string" ? asked.body.trim() : "";

            if (!/^[0-9a-f]{4,64}$/i.test(hash)) {
                throw web.error(400, "Not a commit id.");
            }

            if (subject === "" || subject.includes("\n")) {
                throw web.error(400, "A commit needs a title of one line.");
            }

            return reword(web, conversation.cwd, hash, `${subject}\n${description === "" ? "" : `\n${description}\n`}`);
        },
        { conversation: "source" },
    );

    web.conversationRoute(
        "POST",
        "worktree/:source",
        async ({ conversation, body }) => {
            const asked = (typeof body === "object" && body !== null ? body : {}) as {
                theme?: unknown;
                style?: unknown;
            };
            const style = asked.style === "split" ? "split" : "unified";

            return worktreeOf(web, conversation.cwd, {
                themeType: asked.theme === "light" ? "light" : "dark",
                diffStyle: style,
                overflow: style === "split" ? "scroll" : "wrap",
                hunkSeparators: "line-info",
                disableFileHeader: true,
            });
        },
        { conversation: "source" },
    );

    // The review: the tool opens the patch in the browser, and the page polls until the person answers.
    web.conversationRoute(
        "POST",
        "review/:source/:target",
        async ({ conversation, params }) => {
            const target = params.target ?? "";
            let patch: string;

            try {
                patch = await patchOf(web, conversation.cwd, target);
            } catch (failure) {
                return failedOf(
                    conversation.id,
                    target,
                    failure instanceof Error ? failure.message : String(failure),
                );
            }

            if (patch.trim() === "") {
                return failedOf(conversation.id, target, "There is nothing to review.");
            }

            startReview(conversation.id, conversation.cwd, target, patch);

            return { ok: true };
        },
        { conversation: "source" },
    );

    web.conversationRoute(
        "GET",
        "review/:source/:target",
        ({ conversation, params }) => answerOf(reviews.get(conversation.id)?.get(params.target ?? "")),
        { conversation: "source" },
    );

    // A review holds a terminal and a browser tab: when this version goes, the tool goes with it.
    web.onDispose(async () => {
        const running: ChildProcess[] = [];

        for (const ofConversation of reviews.values()) {
            for (const review of ofConversation.values()) {
                if (review.state === "running") {
                    running.push(review.child);
                }
            }
        }

        await Promise.all(running.map((child) => stopReview(child)));
    });

    web.client("history-ui");
}
