// The Git history page: the session folder's commits, newest first, each opening into its diff. It sits with the app's
// own git places: a top bar button just before Changes, a menu row, and a launcher action.

/** The version of `pocket` this module was written for. */
export const pocketApi = 1;

/** The letter in the small tile before a file's name, as the app's Changes view writes it. */
const KINDS = { added: "A", deleted: "D", renamed: "R", modified: "M" };

/** How long ago, in a few characters, as the app's branch list says it. */
function since(at) {
    const seconds = Math.max(0, (Date.now() - at) / 1000);

    if (seconds < 60) {
        return "now";
    }

    if (seconds < 3600) {
        return `${Math.floor(seconds / 60)}m`;
    }

    if (seconds < 86400) {
        return `${Math.floor(seconds / 3600)}h`;
    }

    if (seconds < 86400 * 30) {
        return `${Math.floor(seconds / 86400)}d`;
    }

    return new Date(at).toLocaleDateString();
}

function fullDate(at) {
    return new Date(at).toLocaleString();
}

/** The nearest box above `node` that scrolls, or the page. */
function scrollerOf(node) {
    for (let box = node.parentElement; box !== null; box = box.parentElement) {
        if (/(auto|scroll)/.test(getComputedStyle(box).overflowY) && box.scrollHeight > box.clientHeight) {
            return box;
        }
    }

    return document.scrollingElement;
}

/** `+2 −1`, without a side that has nothing. */
function counts(plus, minus) {
    return `${plus > 0 ? `+${plus}` : ""} ${minus > 0 ? `−${minus}` : ""}`.trim();
}

export default function setup(pocket) {
    const { html, Icon, Loader, useEffect, useRef, useState } = pocket;

    /**
     * One file's diff, as `@pierre/diffs` rendered it on the server: its own markup and styles, in a shadow root, so
     * nothing of the app's CSS reaches it and nothing of its CSS reaches the app.
     */
    function Diff({ source }) {
        const holder = useRef(null);

        useEffect(() => {
            const host = holder.current;

            if (host) {
                const root = host.shadowRoot ?? host.attachShadow({ mode: "open" });

                root.innerHTML = source;
            }
        }, [source]);

        return html`<div class="gh-diff-view" ref=${holder}></div>`;
    }

    /** One file of a commit: its header folds its diff away, and back, as the app's Changes view does. */
    function FileSection({ file }) {
        const [open, setOpen] = useState(true);

        return html`<section class="gh-file">
            <button
                class="gh-file-head"
                type="button"
                aria-expanded=${open}
                title=${open ? "Fold this file's diff" : "Show this file's diff"}
                onClick=${() => setOpen(!open)}
            >
                <span class="gh-chevron" data-open=${open ? "true" : "false"}><${Icon} name="chevron" size=${14} /></span>
                <span class="gh-kind" data-kind=${file.kind}>${KINDS[file.kind] ?? "M"}</span>
                <span class="mono gh-path">${file.oldPath !== "" && file.kind === "renamed" ? `${file.oldPath} → ${file.path}` : file.path}</span>
                <span class="muted small">${counts(file.added, file.removed)}</span>
            </button>
            <div class="gh-fold" data-open=${open ? "true" : "false"}>
                <div class="gh-fold-inner">
                    ${file.binary
                        ? html`<p class="muted small gh-note">A binary file: no lines to compare.</p>`
                        : null}
                    ${file.skipped
                        ? html`<p class="muted small gh-note">Left out: this commit's diff is too long.</p>`
                        : null}
                    ${file.error !== "" ? html`<p class="error-box">${file.error}</p>` : null}
                    ${file.html !== "" ? html`<${Diff} source=${file.html} />` : null}
                </div>
            </div>
        </section>`;
    }

    /** One commit's diff: its files with their hunks, or the reason it could not be read. */
    function Commit({ id, hash, onLoaded }) {
        const [state, setState] = useState({ loading: true });

        useEffect(() => {
            const stop = new AbortController();
            const theme = document.documentElement.dataset.mode === "light" ? "light" : "dark";
            const style = window.innerWidth >= 900 ? "split" : "unified";

            pocket
                .api(`commit/${id}/${hash}?theme=${theme}&style=${style}`, undefined, {
                    signal: stop.signal,
                })
                .then(
                    (commit) => {
                        setState({ commit });
                        onLoaded();
                    },
                    (failure) => {
                        if (!stop.signal.aborted) {
                            setState({ error: failure.message });
                            onLoaded();
                        }
                    },
                );

            return () => stop.abort();
        }, [id, hash]);

        if (state.error) {
            return html`<div class="gh-detail">
                <p class="error-box">${state.error}</p>
            </div>`;
        }

        if (state.loading) {
            return html`<div class="gh-detail">
                <p class="muted small">Reading the commit…</p>
            </div>`;
        }

        const { commit } = state;
        const added = commit.files.reduce((sum, file) => sum + file.added, 0);
        const removed = commit.files.reduce((sum, file) => sum + file.removed, 0);

        return html`<div class="gh-detail">
            <p class="muted small gh-meta-line">
                <span class="mono">${commit.hash.slice(0, 12)}</span>
                · ${commit.author} · ${fullDate(commit.at)}
                ${commit.parents.length > 1 ? "· a merge, shown against its first parent" : ""}
            </p>
            ${commit.body !== "" ? html`<pre class="gh-body">${commit.body}</pre>` : null}
            <p class="muted small">
                ${commit.files.length} ${commit.files.length === 1 ? "file" : "files"} ·
                <span class="gh-add">${counts(added, 0)}</span> <span class="gh-del">${counts(0, removed)}</span>
            </p>
            ${commit.files.length === 0 ? html`<p class="muted small">No changes in this commit.</p>` : null}
            ${commit.files.map((file) => html`<${FileSection} file=${file} />`)}
        </div>`;
    }

    /** The page: the branch and its commits, each opening into its diff. */
    function History() {
        const id = pocket.conversationId();
        const [log, setLog] = useState(null);
        const [error, setError] = useState(null);
        const [busy, setBusy] = useState(false);
        const [open, setOpen] = useState(null);
        const rows = useRef(new Map());
        /** Counts the commits whose diff has come in: the row lines up again once the height is final. */
        const [loaded, setLoaded] = useState(0);

        // A commit that opens above the one just opened collapses, which takes away height: glide the new row to the
        // top of the view, so its changes start right under it, wherever the page was scrolled to. The first pass runs
        // while the diff is still loading and the page may not scroll far enough yet, hence the second.
        useEffect(() => {
            const row = open === null ? undefined : rows.current.get(open);

            if (row === undefined) {
                return;
            }

            const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            const frame = requestAnimationFrame(() => {
                const box = scrollerOf(row);
                const delta = row.getBoundingClientRect().top - box.getBoundingClientRect().top;

                if (Math.abs(delta) >= 1) {
                    box.scrollTo({ top: box.scrollTop + delta, behavior: still ? "auto" : "smooth" });
                }
            });

            return () => cancelAnimationFrame(frame);
        }, [open, loaded]);

        const load = async () => {
            if (id === null) {
                return;
            }

            setBusy(true);

            try {
                setLog(await pocket.api(`log/${id}`));
                setError(null);
            } catch (failure) {
                setError(failure.message);
            } finally {
                setBusy(false);
            }
        };

        useEffect(() => {
            void load();
        }, []);

        if (id === null) {
            return html`<p class="muted">Open a session to see the git history of its folder.</p>`;
        }

        if (error !== null && log === null) {
            return html`<div class="gh">
                <p class="error-box">${error}</p>
                <button class="button" type="button" onClick=${() => void load()}>Try again</button>
            </div>`;
        }

        if (log === null) {
            return html`<div class="gh"><${Loader} label="Reading the history" /></div>`;
        }

        return html`<div class="gh">
            <div class="gh-head">
                ${log.branch !== ""
                    ? html`<span class="gh-chip mono" title="The checked-out branch">
                          <${Icon} name="fork" size=${14} /> ${log.branch}
                      </span>`
                    : null}
                ${log.ahead > 0 || log.behind > 0
                    ? html`<span
                          class="gh-chip mono gh-track"
                          title=${`Against ${log.upstream}: ${log.ahead} to push, ${log.behind} to pull`}
                      >
                          ${log.ahead > 0 ? html`<span class="gh-ahead">↑${log.ahead}</span>` : null}
                          ${log.behind > 0 ? html`<span class="gh-behind">↓${log.behind}</span>` : null}
                      </span>`
                    : null}
                <span class="muted small">
                    ${log.commits.length} ${log.commits.length === 1 ? "commit" : "commits"}${log.more > 0 ? `, ${log.more} older not shown` : ""}
                </span>
            </div>
            ${error !== null ? html`<p class="error-box">${error}</p>` : null}
            ${log.commits.length === 0
                ? html`<p class="muted small">This repository has no commits yet.</p>`
                : html`<ol class="gh-list">
                      ${log.commits.map(
                          (commit) => html`<li class="gh-item">
                              <button
                                  class="gh-row"
                                  type="button"
                                  aria-expanded=${open === commit.hash}
                                  ref=${(node) => {
                                      if (node === null) {
                                          rows.current.delete(commit.hash);
                                      } else {
                                          rows.current.set(commit.hash, node);
                                      }
                                  }}
                                  onClick=${() => setOpen(open === commit.hash ? null : commit.hash)}
                              >
                                  <span class="mono gh-hash">${commit.short}</span>
                                  <span class="gh-subject">${commit.subject || "(no message)"}</span>
                                  <span class="muted small gh-row-meta" title=${fullDate(commit.at)}>
                                      ${commit.author} · ${since(commit.at)}
                                  </span>
                              </button>
                              ${open === commit.hash
                                  ? html`<${Commit}
                                        id=${id}
                                        hash=${commit.hash}
                                        onLoaded=${() => setLoaded((count) => count + 1)}
                                    />`
                                  : null}
                          </li>`,
                      )}
                  </ol>`}
            <div class="gh-foot">
                <button class="button" type="button" disabled=${busy} onClick=${() => void load()}>
                    ${busy ? "Refreshing…" : "Refresh"}
                </button>
                <span class="muted small">The newest ${log.commits.length} commits. Uncommitted work is in Changes.</span>
            </div>
        </div>`;
    }

    pocket.style("history.css");
    pocket.page({ id: "history", title: "Git history", component: History });
    pocket.menu({ id: "history", label: "Git history", hint: "commits", page: "history" });
    pocket.launcher({
        id: "history",
        label: "Git history",
        detail: "the session's commits, with their diffs",
        icon: "fork",
        keywords: ["git", "log", "commits", "history"],
        page: "history",
    });

    if (typeof pocket.topbar === "function") {
        // The header's count of commits not pushed, which a tap pushes. New in 0.19.0, like the top bar buttons.
        let last = null;
        let pushing = false;

        const describe = (status) => {
            const counts = [
                status?.ahead > 0 ? `↑${status.ahead}` : "",
                status?.behind > 0 ? `↓${status.behind}` : "",
            ]
                .filter((part) => part !== "")
                .join(" ");

            if (status === null) {
                return { badge: "", title: "Git remote: open a session to see its branch" };
            }

            if (status.upstream === undefined) {
                return { badge: "", title: `${status.branch || "This branch"} follows no remote branch` };
            }

            return {
                badge: counts,
                title:
                    `${status.ahead} to push, ${status.behind} to pull · ${status.branch} → ${status.upstream}` +
                    (status.ahead > 0 ? ". Click to push." : ""),
            };
        };

        const button = pocket.topbar({
            id: "track",
            title: "Git remote",
            icon: "up",
            run: () => void push(),
            before: "core:changes",
        });

        const refresh = async () => {
            const id = pocket.conversationId();

            if (id === null) {
                last = null;
                button.update(describe(null));

                return;
            }

            try {
                last = await pocket.api(`track/${id}`);
                button.update(describe(last));
            } catch {
                // Not a repository, or no remote: the title says what the last look found.
            }
        };

        async function push() {
            const id = pocket.conversationId();

            if (id === null || pushing) {
                return;
            }

            if (last !== null && last.upstream === undefined) {
                pocket.notify("warning", "This branch follows no remote branch: push it once with -u.");
                return;
            }

            if (last === null || (last.ahead ?? 0) === 0) {
                pocket.notify(
                    "info",
                    (last?.behind ?? 0) > 0
                        ? `${last.behind} commits to pull are on the remote only.`
                        : "Nothing to push.",
                );

                return;
            }

            const ahead = last.ahead;

            pushing = true;
            button.update({ badge: "…", title: "Pushing…" });

            try {
                const result = await pocket.api(`push/${id}`, {});

                pocket.notify(
                    "info",
                    `Pushed ${ahead} ${ahead === 1 ? "commit" : "commits"}` +
                        (result.behind > 0 ? `; ${result.behind} to pull.` : "."),
                );
            } catch (failure) {
                pocket.notify("error", failure.message);
            } finally {
                pushing = false;
                void refresh();
            }
        }

        const timer = setInterval(() => {
            if (!document.hidden) {
                void refresh();
            }
        }, 15_000);
        const onVisible = () => {
            if (!document.hidden) {
                void refresh();
            }
        };

        document.addEventListener("visibilitychange", onVisible);
        pocket.onDispose(() => {
            clearInterval(timer);
            document.removeEventListener("visibilitychange", onVisible);
        });
        void refresh();

        // The page itself, just before Changes, with the app's own git places.
        pocket.topbar({
            id: "history",
            title: "Git history",
            icon: "fork",
            page: "history",
            before: "core:changes",
        });
    }
}
