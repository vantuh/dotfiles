/**
 * Git history: lists the commits of the session's folder, newest first, and shows the diff of each one, beside the
 * app's own Changes and Branch views. Each file's diff is rendered by `@pierre/diffs` (`lib/pierre-ssr.js`).
 */
import { execFile } from "node:child_process";
// In the drop-in folder, the types come from "./_pocket.d.ts".
import type { Web } from "./_pocket.d.ts";

/** The most commits a page reads, and the number it reads by default. */
const MAX_COMMITS = 200;
const DEFAULT_COMMITS = 50;
/** Past this much patch in a commit, the files that are left are named but not rendered: a page cannot draw more. */
const MAX_PATCH_CHARS = 300_000;
const GIT_TIMEOUT_MS = 15_000;
const MAX_BUFFER = 32 * 1024 * 1024;

/** A commit's short fields, each ended by a NUL, and the record by a RS. A subject is text, so it can hold anything. */
const LOG_FORMAT = "%H%x00%h%x00%an%x00%at%x00%s%x1e";
const SHOW_FORMAT = "%H%x00%h%x00%an%x00%ae%x00%at%x00%P%x00%s%x00%b";

type Kind = "modified" | "added" | "deleted" | "renamed";

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

function git(cwd: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
        execFile(
            "git",
            ["--no-pager", ...args],
            { cwd, timeout: GIT_TIMEOUT_MS, maxBuffer: MAX_BUFFER, windowsHide: true },
            (failure, stdout, stderr) => {
                if (failure) {
                    reject(new Error(`${stderr}`.trim() || failure.message));
                } else {
                    resolve(stdout);
                }
            },
        );
    });
}

/** Git's own words for a failure, as the page shows them. */
function gitOrFail(web: Web, cwd: string, args: string[]): Promise<string> {
    return git(cwd, args).catch((failure: unknown) => {
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

/** The folder's commits, newest first, and whether there are more than the page shows. */
async function logOf(web: Web, cwd: string, limit: number) {
    const branch = await git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]).then(
        (name) => name.trim(),
        () => "",
    );
    let output: string;

    try {
        output = await git(cwd, ["log", "-n", `${limit + 1}`, "--date=unix", `--format=${LOG_FORMAT}`]);
    } catch (failure) {
        const words = failure instanceof Error ? failure.message : String(failure);

        // A repository with no commit yet is empty, not broken.
        if (/does not have any commits yet/.test(words)) {
            return { branch, commits: [], more: 0 };
        }

        throw web.error(400, words);
    }

    const commits = output
        .split("\x1e")
        .map((record) => record.replace(/^\n/, "").replace(/\n$/, ""))
        .filter((record) => record !== "")
        .map((record) => {
            const [hash = "", short = "", author = "", at = "", subject = ""] = record.split("\0");

            return { hash, short, author, at: Number(at) * 1000, subject };
        });

    return {
        branch,
        commits: commits.slice(0, limit),
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

    web.client("history-ui");
}
