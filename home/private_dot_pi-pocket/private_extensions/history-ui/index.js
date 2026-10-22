// The Git history page: the session folder's commits, newest first, each opening into its diff. It sits with the app's
// own git places: a top bar button just before Changes, a menu row, and a launcher action.

/** The version of `pocket` this module was written for. */
export const pocketApi = 1;

/** The letter in the small tile before a file's name, as the app's Changes view writes it. */
const KINDS = { added: "A", deleted: "D", renamed: "R", modified: "M" };

/** The target of a comment on work that is not committed yet; a commit's own target is its hash. */
const WORKTREE = "worktree";
const WORKTREE_HEADING = "Uncommitted changes";
/** The side of a line, as a message for Pi names it. */
const SIDE_WORDS = { additions: "new", deletions: "old" };

/**
 * The plus that shows where the pointer rests on a line's number, as Plannotator's review does: a tap there comments on
 * that line. It goes in the diff's own shadow root, beside the renderer's styles, and its place and size are the ones
 * the renderer gives its own gutter button: the end of the gutter, hanging a little over the code, beside the number.
 */
const GUTTER_CSS = `
[data-column-number] {
    position: relative;
    /* A little of the left padding moves to the right: the gutter keeps its width, so the code does not move, and the
       number gives the plus the three pixels it needs. */
    padding-left: calc(2ch - 3px);
    padding-right: calc(1ch + 3px);
    cursor: pointer;
}

/* The plus sits in the room the renderer leaves between a number and its code, and never moves either of them. It is
   drawn with two bars, not with a glyph, so it is square in its box at any font. */
[data-column-number]:hover::after {
    content: "";
    position: absolute;
    top: 50%;
    right: calc(-1ch + 1px);
    z-index: 4;
    width: calc(1lh - 2px);
    height: calc(1lh - 1px);
    border-radius: 5px;
    background-color: var(--accent, #6ea8fe);
    background-image:
        linear-gradient(var(--accent-ink, #08111f), var(--accent-ink, #08111f)),
        linear-gradient(var(--accent-ink, #08111f), var(--accent-ink, #08111f));
    background-size:
        64% 2px,
        2px 60%;
    background-position: center;
    background-repeat: no-repeat;
    transform: translateY(-50%);
}
`;

/** Where this session's comments wait: in this browser, apart from anything the app keeps. */
function reviewKey(id) {
    return `x.git-history.review.${id}`;
}

function isComment(value) {
    return (
        typeof value === "object" &&
        value !== null &&
        typeof value.id === "string" &&
        typeof value.path === "string" &&
        (value.side === "additions" || value.side === "deletions") &&
        Number.isInteger(value.line) &&
        typeof value.text === "string"
    );
}

function readComments(id) {
    if (id === null) {
        return [];
    }

    try {
        const kept = JSON.parse(localStorage.getItem(reviewKey(id)) ?? "[]");

        return Array.isArray(kept) ? kept.filter(isComment) : [];
    } catch {
        return [];
    }
}

function writeComments(id, comments) {
    if (id === null) {
        return;
    }

    try {
        localStorage.setItem(reviewKey(id), JSON.stringify(comments));
    } catch {
        // A full store loses the drafts; the message itself is still sent.
    }
}

function newCommentId() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** A commit as a review names it: its short id, then its first line. */
function headingOf(commit) {
    return `${commit.short} ${commit.subject || "(no message)"}`;
}

/** How many files this review touches: its places, in the words of its own summary. */
function placesOf(comments) {
    return new Set(comments.map((comment) => `${comment.target}:${comment.path}`)).size;
}

/** What the route needs of a comment: the file, the side, and the line. */
function annotationsOf(comments) {
    return comments.map(({ path, side, line }) => ({ path, side, line }));
}

/** The review as one message for Pi: each comment under the commit or the changes it belongs to. */
function reviewText(comments) {
    const groups = new Map();

    for (const comment of comments) {
        const heading = comment.heading ?? "Review";

        groups.set(heading, [...(groups.get(heading) ?? []), comment]);
    }

    const lines = ["Code review: please address these comments."];
    const headings = [...groups.keys()].sort((left, right) =>
        left === WORKTREE_HEADING ? -1 : right === WORKTREE_HEADING ? 1 : 0,
    );

    for (const heading of headings) {
        lines.push("", `## ${heading}`);

        for (const comment of groups.get(heading)) {
            lines.push("", `- \`${comment.path}:${comment.line}\` (${SIDE_WORDS[comment.side]})`);

            if (comment.quote.trim() !== "") {
                lines.push(`  > ${comment.quote.trim()}`);
            }

            lines.push(`  ${comment.text.trim().replace(/\n/g, "\n  ")}`);
        }
    }

    return `${lines.join("\n")}\n`;
}

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
     * nothing of the app's CSS reaches it and nothing of its CSS reaches the app. Each comment is a child of that host
     * with the slot the diff left for it, so the diff's own grid makes room for it.
     */
    function Diff({ source, notes, onPick, onEdit, onDelete }) {
        const holder = useRef(null);

        useEffect(() => {
            const host = holder.current;

            if (host) {
                const root = host.shadowRoot ?? host.attachShadow({ mode: "open" });

                root.innerHTML = source;
                // The renderer's own styles come in layers: these, unlayered, are the ones that win.
                const style = document.createElement("style");

                style.textContent = GUTTER_CSS;
                root.append(style);
            }
        }, [source]);

        // A tap on a line number comments on that line. The click comes out of the shadow root, so it is read here.
        useEffect(() => {
            const host = holder.current;

            if (host === null) {
                return;
            }

            const listen = (event) => {
                const path = event.composedPath();

                if (path.some((node) => node instanceof Element && node.classList.contains("gh-note"))) {
                    return;
                }

                const gutter = path.find(
                    (node) => node instanceof Element && node.hasAttribute("data-column-number"),
                );

                if (gutter === undefined) {
                    return;
                }

                const code = path.find(
                    (node) => node instanceof Element && node.hasAttribute("data-code"),
                );
                const side = code?.hasAttribute("data-additions")
                    ? "additions"
                    : code?.hasAttribute("data-deletions")
                      ? "deletions"
                      : gutter.getAttribute("data-line-type") === "change-deletion"
                        ? "deletions"
                        : "additions";
                const line = Number(gutter.getAttribute("data-column-number"));

                if (!Number.isInteger(line) || line < 1) {
                    return;
                }

                const index = gutter.getAttribute("data-line-index");
                const row = host.shadowRoot?.querySelector(`[data-line][data-line-index="${index}"]`);

                onPick(line, side, (row?.textContent ?? "").trim());
            };

            host.addEventListener("click", listen);

            return () => host.removeEventListener("click", listen);
        }, [onPick, source]);

        return html`<div class="gh-diff-view" ref=${holder}>
            ${notes.map(
                (note) => html`<div
                    class="gh-note"
                    data-note=${note.id}
                    slot=${`annotation-${note.side}-${note.line}`}
                    key=${note.id}
                >
                    <div class="gh-note-head">
                        <span class="gh-note-where mono">
                            ${note.line}${note.side === "deletions" ? " · removed" : ""}
                        </span>
                        <button class="gh-note-act" type="button" title="Edit this comment" onClick=${() => onEdit(note)}>
                            Edit
                        </button>
                        <button class="gh-note-act" type="button" title="Delete this comment" onClick=${() => onDelete(note)}>
                            Delete
                        </button>
                    </div>
                    <p class="gh-note-text">${note.text}</p>
                </div>`,
            )}
        </div>`;
    }

    /** One file of a commit: its header folds its diff away, and back, as the app's Changes view does. */
    function FileSection({ file, notes, onPick, onEdit, onDelete }) {
        const [open, setOpen] = useState(true);
        const pick = (line, side, quote) => onPick(file, line, side, quote);

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
                    ${file.html !== ""
                        ? html`<${Diff}
                              source=${file.html}
                              notes=${notes}
                              onPick=${pick}
                              onEdit=${onEdit}
                              onDelete=${onDelete}
                          />`
                        : null}
                </div>
            </div>
        </section>`;
    }

    /** The count of comments that one side of the review holds, beside its name in the list. */
    function Mark({ comments, target }) {
        const count = comments.filter((comment) => comment.target === target).length;

        return count === 0
            ? null
            : html`<span class="gh-mark" title=${`${count} ${count === 1 ? "comment" : "comments"}`}>
                  ${count}
              </span>`;
    }

    /**
     * One side of the review: the folder's uncommitted work, or one commit. The server draws its files, and leaves a
     * slot under every line that has a comment, so a saved comment is shown in the diff's own grid.
     */
    function Section({ id, target, heading, comments, onLoaded, onPick, onEdit, onDelete }) {
        const [state, setState] = useState({ loading: true });
        const notes = comments.filter((comment) => comment.target === target);
        // The diff is drawn again when the comments for it change, and not on every other render.
        const key = JSON.stringify(annotationsOf(notes)) + notes.map((note) => note.text).join("\u0000");

        useEffect(() => {
            const stop = new AbortController();
            const theme = document.documentElement.dataset.mode === "light" ? "light" : "dark";
            const style = window.innerWidth >= 900 ? "split" : "unified";
            const where = target === WORKTREE ? `worktree/${id}` : `commit/${id}/${target}`;

            pocket
                .api(
                    where,
                    { theme, style, comments: annotationsOf(notes) },
                    { method: "POST", signal: stop.signal },
                )
                .then(
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
        }, [id, target, key]);

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
        const pick = (file, line, side, quote) => onPick(target, heading, file, line, side, quote);

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
            ${answer.left !== undefined && answer.left.length > 0
                ? html`<p class="muted small gh-note">Too big to show: ${answer.left.join(", ")}</p>`
                : null}
            ${answer.files.length === 0
                ? html`<p class="muted small">${target === WORKTREE ? "Nothing uncommitted." : "No changes in this commit."}</p>`
                : null}
            ${answer.files.map(
                (file) => html`<${FileSection}
                    file=${file}
                    notes=${notes.filter((note) => note.path === file.path)}
                    onPick=${pick}
                    onEdit=${onEdit}
                    onDelete=${onDelete}
                />`,
            )}
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
        /** The review this page holds: comments on lines of any commit, and of the uncommitted work. */
        const [comments, setComments] = useState(() => readComments(id));
        /** The comment being written, and its words. A draft with an id is an old comment being changed. */
        const [draft, setDraft] = useState(null);
        const [text, setText] = useState("");

        const keep = (next) => {
            setComments(next);
            writeComments(id, next);
        };

        const edit = (note) => {
            setDraft({ ...note });
            setText(note.text);
        };

        // A line that has a comment already opens it, and another line takes the words typed so far along: the box
        // says where they will go.
        const pick = (target, heading, file, line, side, quote) => {
            const same = comments.find(
                (comment) =>
                    comment.target === target &&
                    comment.path === file.path &&
                    comment.side === side &&
                    comment.line === line,
            );

            if (same !== undefined) {
                edit(same);
                return;
            }

            setDraft({ id: "", target, heading, path: file.path, side, line, quote });
        };

        const remove = (note) => {
            keep(comments.filter((comment) => comment.id !== note.id));

            if (draft?.id === note.id) {
                setDraft(null);
                setText("");
            }
        };

        const save = () => {
            const words = text.trim();

            if (draft === null || words === "") {
                return;
            }

            keep(
                draft.id === ""
                    ? [...comments, { ...draft, id: newCommentId(), text: words }]
                    : comments.map((comment) =>
                          comment.id === draft.id ? { ...comment, text: words } : comment,
                      ),
            );
            setDraft(null);
            setText("");
        };

        const send = () => {
            if (comments.length === 0) {
                return;
            }

            if (typeof pocket.insertText !== "function") {
                pocket.notify("error", "To send a review, Pi Pocket 0.19 or later is needed.");
                return;
            }

            pocket.insertText(reviewText(comments));
            keep([]);
            setDraft(null);
            setText("");
            // The review goes to the message box: the page makes room for it, to be read and sent.
            pocket.closePage?.();
            pocket.notify("info", "The review is in the message box: read it, then send it.");
        };

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
        }, [id]);

        // A page that a reload brought back has no session yet: its review comes with the session.
        useEffect(() => {
            setComments(readComments(id));
        }, [id]);

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
                                    <${Mark} comments=${comments} target=${WORKTREE} />
                                    <span class="muted small gh-row-meta">
                                        ${log.changes} ${log.changes === 1 ? "file" : "files"} changed
                                    </span>
                                </button>
                                ${open === WORKTREE
                                    ? html`<${Section}
                                          id=${id}
                                          target=${WORKTREE}
                                          heading=${WORKTREE_HEADING}
                                          comments=${comments}
                                          onLoaded=${() => setLoaded((count) => count + 1)}
                                          onPick=${pick}
                                          onEdit=${edit}
                                          onDelete=${remove}
                                      />`
                                    : null}
                            </li>`
                          : null}
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
                                  ${commit.remote
                                      ? html`<span class="gh-dot gh-dot-remote" title=${`On ${log.upstream}, not pulled`}></span>`
                                      : commit.unpushed
                                        ? html`<span class="gh-dot gh-dot-local" title="Not pushed"></span>`
                                        : null}
                                  <span class="mono gh-hash">${commit.short}</span>
                                  <span class="gh-subject">${commit.subject || "(no message)"}</span>
                                  <${Mark} comments=${comments} target=${commit.hash} />
                                  <span class="muted small gh-row-meta" title=${fullDate(commit.at)}>
                                      ${commit.author} · ${since(commit.at)}
                                      ${commit.remote ? ` · on ${log.upstream}` : ""}
                                  </span>
                              </button>
                              ${open === commit.hash
                                  ? html`<${Section}
                                        id=${id}
                                        target=${commit.hash}
                                        heading=${headingOf(commit)}
                                        comments=${comments}
                                        onLoaded=${() => setLoaded((count) => count + 1)}
                                        onPick=${pick}
                                        onEdit=${edit}
                                        onDelete=${remove}
                                    />`
                                  : null}
                          </li>`,
                      )}
                  </ol>`
                : null}
            ${draft === null
                ? null
                : html`<div class="gh-editor">
                      <div class="gh-editor-head">
                          <span class="mono gh-editor-where">
                              ${draft.path}:${draft.line}
                              ${draft.side === "deletions" ? " · an old line" : ""}
                          </span>
                          <button
                              class="gh-note-act"
                              type="button"
                              title="Close without saving"
                              onClick=${() => {
                                  setDraft(null);
                                  setText("");
                              }}
                          >
                              Close
                          </button>
                      </div>
                      ${draft.quote === "" ? null : html`<pre class="gh-quote">${draft.quote}</pre>`}
                      <textarea
                          class="gh-input"
                          rows="3"
                          autoFocus
                          placeholder=${draft.target === WORKTREE
                              ? "What should change here?"
                              : `A comment on ${draft.heading}`}
                          value=${text}
                          onInput=${(event) => setText(event.target.value)}
                          onKeyDown=${(event) => {
                              if (event.key === "Escape") {
                                  setDraft(null);
                                  setText("");
                              } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                                  save();
                              }
                          }}
                      ></textarea>
                      <div class="gh-editor-actions">
                          <span class="muted small">Ctrl+Enter saves</span>
                          <button
                              class="button"
                              type="button"
                              disabled=${text.trim() === ""}
                              onClick=${() => save()}
                          >
                              ${draft.id === "" ? "Comment" : "Save"}
                          </button>
                      </div>
                  </div>`}
            <div class="gh-foot">
                <button class="button" type="button" disabled=${busy} onClick=${() => void load()}>
                    ${busy ? "Refreshing…" : "Refresh"}
                </button>
                ${comments.length === 0
                    ? html`<span class="muted small">
                          Tap a line's number to comment on it.
                      </span>`
                    : html`<span class="muted small gh-review">
                          ${comments.length} ${comments.length === 1 ? "comment" : "comments"} ·
                          ${placesOf(comments)} ${placesOf(comments) === 1 ? "place" : "places"}
                          <button class="button" type="button" title="Send this review to Pi" onClick=${() => send()}>
                              Send review
                          </button>
                          <button class="button" type="button" onClick=${() => keep([])}>Clear</button>
                      </span>`}
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
