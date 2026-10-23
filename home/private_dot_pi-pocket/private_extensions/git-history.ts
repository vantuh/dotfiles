/**
 * Git history: lists the commits of the session's folder, newest first, and shows the diff of each one, beside the
 * app's own Changes and Branch views. Each file's diff is rendered by `@pierre/diffs` (`lib/pierre-ssr.js`).
 */
import { execFile } from "node:child_process";
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
const LOG_FORMAT = "%H%x00%h%x00%an%x00%at%x00%s%x1e";
const SHOW_FORMAT = "%H%x00%h%x00%an%x00%ae%x00%at%x00%P%x00%s%x00%b";
/** An untracked file over this size is named but not read: the page cannot draw it, and its patch is not worth it. */
const MAX_UNTRACKED_BYTES = 2 * 1024 * 1024;

type Kind = "modified" | "added" | "deleted" | "renamed";

/** One commit in the list: `unpushed` when it is only here, `remote` when it is only on the remote branch. */
type Logged = {
    hash: string;
    short: string;
    author: string;
    at: number;
    subject: string;
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
            const [hash = "", short = "", author = "", at = "", subject = ""] = record.split("\0");

            return { hash, short, author, at: Number(at) * 1000, subject };
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
 * The folder's uncommitted work: the changes to tracked files against the last commit, then each untracked file as a
 * new one. A folder with no commit yet compares what is staged instead.
 */
async function worktreeOf(web: Web, cwd: string, options: DiffOptions) {
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

    const files = await filesOf(parts.join(""), options);

    return {
        files,
        added: files.reduce((sum, file) => sum + file.added, 0),
        removed: files.reduce((sum, file) => sum + file.removed, 0),
        left,
        omitted: files.filter((file) => file.skipped).length,
    };
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
    // A merge shows what it brought to its first parent, as GitHub's own view does; a root commit shows all of it.
    const patch =
        before.length > 0
            ? await gitOrFail(web, cwd, ["diff", "--no-color", "--find-renames", before[0]!, full])
            : await gitOrFail(web, cwd, ["show", "--no-color", "--format=", "--patch", full]);
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

    web.client("history-ui");
}
