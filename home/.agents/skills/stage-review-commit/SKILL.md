---
name: stage-review-commit
description: >
  Run an interactive human-review gate for a large dirty Git tree: stage one logical slice, let the
  user inspect it side by side, commit only after explicit approval, then stage the next slice. Use
  whenever the user wants to review staged changes before every commit, separate mixed changes
  within the same file, stage one step at a time, or inspect and approve each logical commit in
  sequence. Prefer this over split-to-commits when human review between commits—not automatic
  splitting—is the primary goal.
compatibility: Requires Git and a repository with an existing HEAD commit. Hunk integration is optional.
---

# Stage, Review, Commit

Convert one large dirty tree into a human-controlled queue:

```text
inventory → agree plan → stage one slice → human review → explicit commit
          → verify → stage next slice → human review → ...
```

The Git index is the current review candidate. The working tree keeps the
remaining changes. Do not build a stack of per-slice stashes: ordering,
conflicts, untracked files, and overlapping edits make that approach fragile.

## Non-negotiable safety

- Never lose or discard work.
- Never run `reset --hard`, `clean`, recursive deletion, force-push, or history
  rewriting.
- Never use `git add .` or `git add -A` against the real index. Stage only named
  paths or selected hunks.
- Never commit until the user explicitly approves the **currently staged**
  candidate. Approval of the plan is not approval to commit.
- One “commit” approval authorizes exactly one commit.
- Do not amend, rebase, revert, or push unless separately requested.
- Do not alter ignored files. Treat dirty submodules as separate repositories;
  stop and ask the user to secure/review their internal changes first.
- Keep the final combined content identical to the content present when the
  session began, except for changes the user explicitly requests during review.

## 1. Detect a resumable session

Resolve the repository root and external temporary state directory:

```bash
ROOT=$(git rev-parse --show-toplevel)
GIT_DIR=$(git rev-parse --absolute-git-dir)
STATE_ROOT="${TMPDIR:-/tmp}/pi-stage-review-commit"
REPO_ID=$(printf '%s' "$GIT_DIR" | git hash-object --stdin)
REPO_STATE_DIR="$STATE_ROOT/$REPO_ID"
```

Session metadata must stay outside the repository and its `.git` directory. If
`$REPO_STATE_DIR/current` exists, read the referenced session's `state.md`, then
compare it with `git status --short`, `git diff --cached --stat`, and
`git log --oneline -3`.

- If they agree, summarize the current candidate and resume at the review gate.
- If HEAD/index/worktree drifted, do not guess. Explain the mismatch and ask
  whether to resume manually or start a new plan.
- A stale session never authorizes a commit.

## 2. Inventory all work

Run these read-only checks, preferably in parallel:

```bash
git status --short
git diff --stat
git diff --cached --stat
git diff --name-status
git diff --cached --name-status
git log --oneline -10
```

Read enough of both staged and unstaged diffs to understand intent. Include
untracked files. Use conversation history, nearby tests, and project docs when
the diff is ambiguous.

Classify changes as `fix`, `feat`, `refactor`, `perf`, `test`, `docs`, `style`,
`build`, `ci`, or `chore`. Mark every **mixed file** whose changes belong to
multiple slices.

A slice should tell one coherent story and avoid “and also” in its summary.
Prefer a slightly larger coherent slice over a clever but fragile line-level
split. If two edits overlap or one cannot compile/read sensibly without the
other, keep them together and explain why.

## 3. Propose the queue

Present the ordered plan before changing the index:

```text
1. fix(producer): preserve correlation IDs
   Files: src/producer.ts; selected hunk in src/module.ts
   Stage: whole files + partial patch
   Verify: producer unit test
2. feat(encoding): add gzip codec
   Files: src/encoding/**; remaining src/module.ts hunk
   Stage: whole files + partial patch
   Verify: encoding unit test
```

For every mixed file, identify which slice owns each hunk. Default ordering is:

1. fixes;
2. foundational features before their consumers/wiring;
3. refactors and performance changes;
4. tests when they are intentionally separate;
5. style/tooling;
6. documentation.

Tests may belong with the behavior they prove when that produces a more
reviewable, independently meaningful commit. Match the repository's established
commit style rather than forcing the default ordering.

Ask the user to approve or revise the plan. Do not stage the first candidate yet.

## 4. Create the safety snapshot

After plan approval and before repartitioning the index, run:

```bash
~/.pi/agent/skills/stage-review-commit/scripts/create-snapshot.sh
```

Record the printed session directory and backup ref in the response. The script:

- stores tracked staged/unstaged state as a stash commit referenced under
  `refs/backup/pi-stage-review/...` without changing the worktree;
- archives non-ignored untracked files under
  `${TMPDIR:-/tmp}/pi-stage-review-commit/...`;
- records original HEAD/status and creates the resumable session pointer there.

Temporary state can be purged by the operating system. It supports the active
review session but is not a durable backup. The tracked backup ref remains in
Git because it must keep the backup commit reachable; it is not a tracked file
and never appears in `git status` or commit content.

If the script fails, stop. Do not alter the index. It intentionally rejects
repositories without an existing HEAD commit. Its snapshot does not preserve
uncommitted content inside submodules; secure each dirty submodule separately
before proceeding.

Write the approved plan and current status to the generated `state.md`. Keep
this file outside the worktree, under the session directory.

## 5. Normalize the index

The queue owns both initially staged and unstaged changes. After the snapshot,
remove pre-existing entries from the real index while preserving worktree
content. Use named paths, for example:

```bash
git restore --staged -- path/to/file path/to/other-file
```

Do not use a blanket command if named paths can express the operation. Verify:

```bash
git status --short
git diff --cached --stat
```

The staged diff should now be empty. If it is not, inspect and resolve it before
preparing a candidate. If status and diffs disagree, check for intent-to-add
entries with `git ls-files --debug`; explain and normalize them deliberately
rather than assuming the index is empty.

## 6. Prepare exactly one candidate

Stage the next approved slice and nothing else.

Preferred methods, safest first:

1. **Whole-file ownership:** `git add -- exact/path another/path`.
2. **Separated hunks:** use partial staging for only the approved hunks.
3. **Constructed cached patch:** for mixed files, build a minimal patch, run
   `git apply --cached --check <patch>`, then `git apply --cached <patch>`.

Store temporary patches inside the active session directory, not in the project
worktree. Do not pipe guessed answers into an interactive `git add -p`. If a
partial patch requires inventing an intermediate file that is confusing or
invalid, stop and merge/reorder slices with the user's approval.

For renames, deletions, and new files, verify the staged file status explicitly.
Do not stage unrelated formatting introduced around the same code.

Validate the candidate:

```bash
git diff --cached --check
git diff --cached --stat
git diff --cached --name-status
git status --short
```

Read `git diff --cached` closely enough to confirm logical boundaries. Also
inspect `git diff` as the remaining queue; for mixed files it is relative to the
current index, which is desirable—it shows what remains after this candidate.

Update `state.md` with:

- current step and proposed commit message;
- exact staged files/hunks;
- remaining steps;
- current HEAD;
- status `awaiting-review`.

## 7. Put the candidate in front of the user

Report only the useful review summary:

```text
Step 1/4 ready: fix(producer): preserve correlation IDs
Staged: 2 files, +18/-7
Remaining: 9 files
Checks: git diff --cached --check ✓
Backup: refs/backup/pi-stage-review/...

Review the Staged Changes in your IDE/Hunk.
Commands: `commit`, `adjust stage: ...`, `show remaining`, or `pause`.
```

### Side-by-side review with Hunk

Hunk's TUI belongs to the user; never start its interactive command inside the
agent's shell.

If a live Hunk session exists, reload it to the candidate:

```bash
hunk session list --json
hunk session reload --repo "$ROOT" -- diff --cached
```

If no session exists, tell the user to launch this in their own terminal:

```bash
hunk diff --cached
```

Alternatively, use the IDE's **Staged Changes** view or a configured
`git difftool --cached`. On request, show/reload the remaining queue with
`git diff` / `hunk ... -- diff`, then return to `diff --cached` before approval.

Do not paste a huge patch into chat unless requested. Keep the staged candidate
stable while the user reviews it.

## 8. Interpret review commands narrowly

- **`commit`** — approve exactly the currently staged candidate.
- **`adjust stage: ...`** — adjust only the candidate, revalidate, reload the
  review, and wait again.
- **`show remaining`** — inspect remaining unstaged work without modifying the
  candidate.
- **`pause`** — leave the current candidate staged, report session and backup
  locations, and make no further changes.
- Ambiguous feedback is not commit approval. Ask a focused question.

Inline review comments do not automatically authorize edits. Summarize proposed
adjustments and apply only what the user asks.

## 9. Commit one approved candidate

Immediately before committing, re-read:

```bash
git diff --cached --check
git diff --cached --stat
git diff --cached
git status --short
```

If the candidate changed since it was shown, stop and ask for approval again.
If it is unchanged, create a concise Conventional Commit message:

```text
<type>(<scope>): <imperative summary>
```

Keep the subject at 50 characters when practical (72 hard maximum). Add a body
only for non-obvious rationale, breaking changes, security fixes, migrations,
or reverts. Match project conventions. Never add AI attribution unless the
repository explicitly requires it.

Run one `git commit`. If a hook fails or modifies files, do not bypass it and do
not prepare the next slice. Inspect staged/worktree drift, restore the intended
full content from the safety snapshot if necessary, and return to review.

After a successful commit:

```bash
git log --oneline -1
git status --short
git diff --stat
git diff --cached --stat
```

Run the smallest relevant check when practical. Remember that checks against a
dirty worktree include later slices; do not claim they prove the isolated commit.
Update `state.md` to `committed`, record hash/message, and only then prepare the
next candidate using Sections 6–7. Wait for fresh explicit approval.

## 10. Finish

After the final approved commit:

```bash
git status --short
git log --oneline -<number-of-created-commits>
```

Run the project's required final checks. Confirm the worktree is clean and the
resulting tree matches the session's original combined content, except for
explicit review edits. Mark `state.md` as `complete`; keep backup artifacts until
the user asks to remove them.

Report:

- commit hashes and subjects;
- checks run and checks skipped;
- backup ref/session directory;
- any user-approved deviation from the original combined content.

## Recovery

On any corruption, conflict, surprising hook rewrite, or uncertain state: stop
committing. Read [references/recovery.md](references/recovery.md). Recovery is
explicit and user-approved; never overwrite the current worktree merely because
a backup exists.

## Boundaries

- For automatic splitting with no review gate between commits, use
  `split-to-commits`.
- For only generating a commit message, use `caveman-commit`.
- For reviewing an already running Hunk session without staging/committing, use
  `hunk-review`.
- This skill does not push, open PRs, create branches, or rewrite history.
