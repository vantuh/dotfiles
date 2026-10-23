// The Git history page: the session folder's commits, newest first, each opening into its diff. It sits with the app's
// own git places: a top bar button just before Changes, a menu row, and a launcher action.

/** The version of `pocket` this module was written for. */
export const pocketApi = 1;

/** The letter in the small tile before a file's name, as the app's Changes view writes it. */
const KINDS = { added: "A", deleted: "D", renamed: "R", modified: "M" };

/** The target of work that is not committed yet; a commit's own target is its hash. */
const WORKTREE = "worktree";
const WORKTREE_HEADING = "Uncommitted changes";
/** How often the page asks whether the review tool has answered. */
const REVIEW_POLL_MS = 1_500;
/** A pencil, as the app has no icon for an edit. */
const PENCIL = "M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4";

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

    /**
     * One side of the history: the folder's uncommitted work, or one commit. The server draws its files.
     */
    function Section({ id, target, onLoaded }) {
        const [state, setState] = useState({ loading: true });
        const [review, setReview] = useState({ state: "none" });
        /** The review's requests: a folded row or another page stops them. */
        const reviewStop = useRef(null);
        const reviewTimer = useRef(null);

        useEffect(() => {
            const stop = new AbortController();

            reviewStop.current = stop;

            return () => {
                stop.abort();
                clearTimeout(reviewTimer.current);
            };
        }, [id, target]);

        /** Writes the review's answer: on `done` its text goes to the message box, on `failed` the panel says why. */
        const settleReview = (answer) => {
            setReview(answer);

            if (answer.state === "failed") {
                pocket.notify("error", answer.error);
            } else if (answer.state === "done" && answer.decision === "dismissed") {
                pocket.notify("info", "The review was closed without comments.");
            } else if (answer.state === "done" && answer.message !== "") {
                pocket.insertText(answer.message);
                pocket.notify("info", "The review's comments are in the message box.");
            } else if (answer.state === "done") {
                pocket.notify("info", "Approved.");
            }
        };

        /** Asks for the review's state until it is no longer running. */
        const pollReview = async () => {
            const stop = reviewStop.current;

            try {
                const answer = await pocket.api(`review/${id}/${target}`, undefined, {
                    signal: stop.signal,
                });

                if (stop.signal.aborted) {
                    return;
                }

                if (answer.state === "running") {
                    setReview(answer);
                    reviewTimer.current = setTimeout(() => void pollReview(), REVIEW_POLL_MS);
                    return;
                }

                settleReview(answer);
            } catch (failure) {
                if (!stop.signal.aborted) {
                    settleReview({ state: "failed", error: failure.message });
                }
            }
        };

        const startReview = async () => {
            const stop = reviewStop.current;

            // The button says it at once, and a second click waits: one review for one target.
            setReview({ state: "running" });

            try {
                const answer = await pocket.api(`review/${id}/${target}`, {}, {
                    method: "POST",
                    signal: stop.signal,
                });

                if (stop.signal.aborted) {
                    return;
                }

                if (answer.ok === true) {
                    await pollReview();
                } else {
                    settleReview(answer);
                }
            } catch (failure) {
                if (!stop.signal.aborted) {
                    settleReview({ state: "failed", error: failure.message });
                }
            }
        };

        // A row that folds and opens again during a review finds it still running on the server.
        useEffect(() => {
            const stop = reviewStop.current;

            pocket.api(`review/${id}/${target}`, undefined, { signal: stop.signal }).then(
                (answer) => {
                    if (!stop.signal.aborted && answer.state === "running") {
                        setReview(answer);
                        void pollReview();
                    }
                },
                () => {},
            );
        }, [id, target]);

        useEffect(() => {
            const stop = new AbortController();
            const theme = document.documentElement.dataset.mode === "light" ? "light" : "dark";
            const style = window.innerWidth >= 900 ? "split" : "unified";
            const ask =
                target === WORKTREE
                    ? pocket.api(`worktree/${id}`, { theme, style }, {
                          method: "POST",
                          signal: stop.signal,
                      })
                    : pocket.api(`commit/${id}/${target}?theme=${theme}&style=${style}`, undefined, {
                          signal: stop.signal,
                      });

            ask.then(
                (answer) => {
                    setState({ answer });
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
        }, [id, target]);

        if (state.error) {
            return html`<div class="gh-detail">
                <p class="error-box">${state.error}</p>
            </div>`;
        }

        if (state.loading) {
            return html`<div class="gh-detail">
                <p class="muted small">${target === WORKTREE ? "Reading the changes…" : "Reading the commit…"}</p>
            </div>`;
        }

        const { answer } = state;
        const added = answer.files.reduce((sum, file) => sum + file.added, 0);
        const removed = answer.files.reduce((sum, file) => sum + file.removed, 0);

        return html`<div class="gh-detail">
            ${target === WORKTREE
                ? null
                : html`<p class="muted small gh-meta-line">
                      <span class="mono">${answer.hash.slice(0, 12)}</span>
                      · ${answer.author} · ${fullDate(answer.at)}
                      ${answer.parents.length > 1 ? "· a merge, shown against its first parent" : ""}
                  </p>`}
            ${target !== WORKTREE && answer.body !== ""
                ? html`<pre class="gh-body">${answer.body}</pre>`
                : null}
            <p class="muted small">
                ${answer.files.length} ${answer.files.length === 1 ? "file" : "files"} ·
                <span class="gh-add">${counts(added, 0)}</span> <span class="gh-del">${counts(0, removed)}</span>
            </p>
            <div class="gh-review">
                <button
                    class="button"
                    type="button"
                    disabled=${review.state === "running"}
                    onClick=${() => void startReview()}
                >
                    ${review.state === "running" ? "Reviewing…" : "Review"}
                </button>
                <span class="muted small">Open this diff in Plannotator.</span>
            </div>
            ${review.state === "failed" ? html`<p class="error-box">${review.error}</p>` : null}
            ${answer.left !== undefined && answer.left.length > 0
                ? html`<p class="muted small gh-note">Too big to show: ${answer.left.join(", ")}</p>`
                : null}
            ${answer.files.length === 0
                ? html`<p class="muted small">${target === WORKTREE ? "Nothing uncommitted." : "No changes in this commit."}</p>`
                : null}
            ${answer.files.map((file) => html`<${FileSection} file=${file} />`)}
        </div>`;
    }

    /** The sheet that edits a commit's title and description. `onSaved` gets the commit's new id. */
    function Reword({ id, commit, onSaved, close }) {
        const [subject, setSubject] = useState(commit.subject);
        const [body, setBody] = useState(commit.body);
        const [busy, setBusy] = useState(false);
        const [error, setError] = useState(null);

        const save = async (event) => {
            event.preventDefault();
            setBusy(true);

            try {
                const { hash } = await pocket.api(`reword/${id}/${commit.hash}`, { subject, body });

                close();
                pocket.notify("info", "The commit message is changed.");
                onSaved(hash);
            } catch (failure) {
                setError(failure.message);
                setBusy(false);
            }
        };

        return html`<form class="gh-reword" onSubmit=${save}>
            <p class="muted small">
                <span class="mono">${commit.short}</span> and the commits after it get new ids. The files stay as they are.
            </p>
            <label class="gh-field">
                <span class="small muted">Title</span>
                <input value=${subject} autofocus onInput=${(event) => setSubject(event.currentTarget.value)} />
            </label>
            <label class="gh-field">
                <span class="small muted">Description</span>
                <textarea rows="8" value=${body} onInput=${(event) => setBody(event.currentTarget.value)}></textarea>
            </label>
            ${error !== null ? html`<p class="error-box">${error}</p>` : null}
            <div class="row">
                <button class="button ghost" type="button" onClick=${() => close()}>Cancel</button>
                <button class="button primary grow" disabled=${busy || subject.trim() === ""}>
                    ${busy ? "Saving…" : "Save"}
                </button>
            </div>
        </form>`;
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
            ${log.commits.length === 0 && !(log.changes > 0)
                ? html`<p class="muted small">This repository has no commits yet.</p>`
                : null}
            ${log.commits.length > 0 || log.changes > 0
                ? html`<ol class="gh-list">
                      ${log.changes > 0
                          ? html`<li class="gh-item">
                                <button
                                    class="gh-row"
                                    type="button"
                                    aria-expanded=${open === WORKTREE}
                                    ref=${(node) => {
                                        if (node === null) {
                                            rows.current.delete(WORKTREE);
                                        } else {
                                            rows.current.set(WORKTREE, node);
                                        }
                                    }}
                                    onClick=${() => setOpen(open === WORKTREE ? null : WORKTREE)}
                                >
                                    <span class="gh-dot gh-dot-work" title="Not committed"></span>
                                    <span class="gh-subject">${WORKTREE_HEADING}</span>
                                    <span class="muted small gh-row-meta">
                                        ${log.changes} ${log.changes === 1 ? "file" : "files"} changed
                                    </span>
                                </button>
                                ${open === WORKTREE
                                    ? html`<${Section}
                                          id=${id}
                                          target=${WORKTREE}
                                          onLoaded=${() => setLoaded((count) => count + 1)}
                                      />`
                                    : null}
                            </li>`
                          : null}
                      ${log.commits.map(
                          (commit) => html`<li class="gh-item">
                              <div class="gh-line">
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
                                      ${commit.remote
                                          ? html`<span class="gh-dot gh-dot-remote" title=${`On ${log.upstream}, not pulled`}></span>`
                                          : commit.unpushed
                                            ? html`<span class="gh-dot gh-dot-local" title="Not pushed"></span>`
                                            : null}
                                      <span class="mono gh-hash">${commit.short}</span>
                                      <span class="gh-subject">${commit.subject || "(no message)"}</span>
                                      <span class="muted small gh-row-meta" title=${fullDate(commit.at)}>
                                          ${commit.author} · ${since(commit.at)}
                                          ${commit.remote ? ` · on ${log.upstream}` : ""}
                                      </span>
                                  </button>
                                  ${!commit.remote && (log.upstream === undefined || commit.unpushed)
                                      ? html`<button
                                            class="gh-edit"
                                            type="button"
                                            title="Edit the commit message"
                                            aria-label="Edit the commit message"
                                            onClick=${() =>
                                                pocket.openSheet("reword", {
                                                    id,
                                                    commit,
                                                    onSaved: (hash) => {
                                                        setOpen(open === commit.hash ? hash : null);
                                                        void load();
                                                    },
                                                })}
                                        >
                                            <${Icon} path=${PENCIL} size=${15} />
                                        </button>`
                                      : null}
                              </div>
                              ${open === commit.hash
                                  ? html`<${Section}
                                        id=${id}
                                        target=${commit.hash}
                                        onLoaded=${() => setLoaded((count) => count + 1)}
                                    />`
                                  : null}
                          </li>`,
                      )}
                  </ol>`
                : null}
            <div class="gh-foot">
                <button class="button" type="button" disabled=${busy} onClick=${() => void load()}>
                    ${busy ? "Refreshing…" : "Refresh"}
                </button>
                <span class="muted small">The newest ${log.commits.length} commits.</span>
            </div>
        </div>`;
    }

    pocket.style("history.css");
    pocket.page({ id: "history", title: "Git history", component: History });
    pocket.sheet({ id: "reword", title: "Edit commit message", component: Reword });
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
        // The header's counts of commits: green for what waits to be pushed (a tap pushes it), red for what waits to
        // be pulled. Each hides when its side has nothing.
        let last = null;
        /** The session the counts belong to: a switch to another one reads its own at once. */
        let shownFor;
        let pushing = false;

        const pushButton = pocket.topbar({
            id: "push",
            title: "Push commits",
            icon: "up",
            run: () => void push(),
            before: "core:changes",
        });
        const pullButton = pocket.topbar({
            id: "pull",
            title: "Pull commits",
            icon: "down",
            run: () => pull(),
            before: "core:changes",
        });

        const show = () => {
            const ahead = last?.ahead ?? 0;
            const behind = last?.behind ?? 0;
            const upstream = last?.upstream ?? "the remote";

            pushButton.update({
                badge: pushing ? "…" : ahead > 0 ? `↑${ahead}` : "",
                title:
                    last === null
                        ? "Push commits: open a session"
                        : ahead > 0
                          ? `Push ${ahead} ${ahead === 1 ? "commit" : "commits"} to ${upstream}`
                          : "Push commits: nothing to push",
            });
            pullButton.update({
                badge: behind > 0 ? `↓${behind}` : "",
                title:
                    behind > 0
                        ? `Pull ${behind} ${behind === 1 ? "commit" : "commits"} from ${upstream}`
                        : "Pull commits: nothing to pull",
            });
        };

        const read = async () => {
            const id = pocket.conversationId();

            if (id === null) {
                shownFor = null;
                last = null;
                show();

                return;
            }

            try {
                const status = await pocket.api(`track/${id}`);

                // The tab may have moved to another session while this waited: its answer is not this one's.
                if (pocket.conversationId() !== id) {
                    return;
                }

                shownFor = id;
                last = status;
            } catch {
                if (pocket.conversationId() !== id) {
                    return;
                }

                shownFor = id;
                last = null;
            }

            show();
        };

        function pull() {
            const behind = last?.behind ?? 0;

            pocket.notify(
                "info",
                behind > 0
                    ? `${behind} ${behind === 1 ? "commit" : "commits"} to pull: run git pull in a terminal, or ask Pi.`
                    : "Nothing to pull.",
            );
        }

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
            show();

            try {
                const result = await pocket.api(`push/${id}`, {});

                if (pocket.conversationId() === id) {
                    shownFor = id;
                    last = result;
                }

                pocket.notify(
                    "info",
                    `Pushed ${ahead} ${ahead === 1 ? "commit" : "commits"}` +
                        (result.behind > 0 ? `; ${result.behind} to pull.` : "."),
                );
            } catch (failure) {
                pocket.notify("error", failure.message);
            } finally {
                pushing = false;
                void read();
            }
        }

        // A switch to another session shows that session's own counts within a second; and they are read again now and
        // then, for what happens in the folder.
        const switched = setInterval(() => {
            if (!document.hidden && pocket.conversationId() !== shownFor) {
                void read();
            }
        }, 500);
        const timer = setInterval(() => {
            if (!document.hidden) {
                void read();
            }
        }, 15_000);
        const onVisible = () => {
            if (!document.hidden) {
                void read();
            }
        };

        document.addEventListener("visibilitychange", onVisible);
        pocket.onDispose(() => {
            clearInterval(switched);
            clearInterval(timer);
            document.removeEventListener("visibilitychange", onVisible);
        });
        void read();

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
