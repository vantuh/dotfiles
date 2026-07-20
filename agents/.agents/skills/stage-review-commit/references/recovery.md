# Recovery guide

Use this only when a stage-review session drifted, a hook rewrote files, or the
worktree/index may be corrupt. Recovery can overwrite work, so inspect first and
get explicit user approval before applying anything.

## Locate the active snapshot

```bash
ROOT=$(git rev-parse --show-toplevel)
GIT_DIR=$(git rev-parse --absolute-git-dir)
STATE_ROOT="${TMPDIR:-/tmp}/pi-stage-review-commit"
REPO_ID=$(printf '%s' "$GIT_DIR" | git hash-object --stdin)
REPO_STATE_DIR="$STATE_ROOT/$REPO_ID"
SESSION_ID=$(cat "$REPO_STATE_DIR/current")
SESSION_DIR="$REPO_STATE_DIR/$SESSION_ID"

cat "$REPO_STATE_DIR/sessions.log"
cat "$SESSION_DIR/state.md"
cat "$SESSION_DIR/original-status.txt"
cat "$SESSION_DIR/original-head.txt"
```

The session contains:

- `original-staged.patch` — inspectable fallback of the original staged tracked
  diff; validate with `git apply --cached --check` before any approved use;
- `original-unstaged.patch` — inspectable fallback of the original unstaged
  tracked diff; validate with `git apply --check` before any approved use;
- `original-status.txt` — human-readable starting status;
- `untracked-files.zlist` and possibly `untracked.tar.gz`;
- a tracked backup ref shown in `state.md`.

The stash-style backup commit preserves both the original tracked working tree
and its original index parent. The archive preserves non-ignored untracked files.
Ignored files were never touched or archived.

## Inspect without restoring

```bash
git show --stat refs/backup/pi-stage-review/<session>/tracked
git diff HEAD refs/backup/pi-stage-review/<session>/tracked
tar -tzf "$SESSION_DIR/untracked.tar.gz"
```

Omit the `tar` command when no archive exists. Compare suspicious individual
files before deciding on recovery:

```bash
git show refs/backup/pi-stage-review/<session>/tracked:path/to/file
```

A stash commit's top tree represents the original tracked working-tree result.
Its second parent represents the original index when one exists:

```bash
git diff HEAD refs/backup/pi-stage-review/<session>/tracked^2
git diff refs/backup/pi-stage-review/<session>/tracked^2 \
  refs/backup/pi-stage-review/<session>/tracked
```

## Safest repair: restore only named files

Prefer restoring only confirmed-corrupt paths while preserving all other current
work. First save the current state with a new snapshot if it contains valuable
new edits. Then, with user approval, extract a file from the backup into a
temporary location, compare it, and copy it into place.

Do not blindly run `git stash apply` over a dirty worktree. Do not use
`reset --hard` or `clean`.

## Full tracked-state recovery

Full recovery is a last resort. Before it:

1. inspect current `git status`, staged diff, and unstaged diff;
2. create another safety snapshot if current work must be retained;
3. ensure the chosen destination is clean or fully snapshotted;
4. obtain explicit approval to replace the current tracked state;
5. choose whether to recover the original combined content or the original
   staged/unstaged partition.

A stash-style apply may be appropriate only after those conditions hold:

```bash
git stash apply --index refs/backup/pi-stage-review/<session>/tracked
```

This can conflict and must never be run automatically. If it conflicts, stop;
do not attempt automatic cleanup or another apply. Preserve and inspect the
conflict state, then prefer the named-file recovery path above. Without
`--index`, Git restores combined tracked content but not the original index
partition.

## Restore untracked files

List the archive and check for collisions first:

```bash
tar -tzf "$SESSION_DIR/untracked.tar.gz"
```

Extract only with explicit approval and only when it will not overwrite newer
files:

```bash
(cd "$ROOT" && tar -xzf "$SESSION_DIR/untracked.tar.gz")
```

Prefer extracting to a temporary directory and comparing when collisions are
possible.

## Resume after repair

After restoring the intended full content:

```bash
git status --short
git diff --check
git diff --cached --check
```

Run the project's typecheck or smallest integrity check. Re-read the remaining
queue and revise `state.md`. Return to the review gate; prior approval is void
after any recovery or candidate change.

## Backup retention

Keep `refs/backup/pi-stage-review/...` and the external temporary session
directory until the user confirms the commit sequence and final checks. The
operating system may purge temporary files, so this state is not a durable
backup. Removing remaining backups is a separate cleanup action requiring an
explicit request.
