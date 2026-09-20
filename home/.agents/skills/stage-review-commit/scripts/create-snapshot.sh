#!/usr/bin/env bash
set -euo pipefail

if ! root=$(git rev-parse --show-toplevel 2>/dev/null); then
  printf 'error: not inside a Git repository\n' >&2
  exit 1
fi

if ! git -C "$root" rev-parse --verify HEAD >/dev/null 2>&1; then
  printf 'error: stage-review-commit requires an existing HEAD commit\n' >&2
  exit 2
fi

git_dir=$(git -C "$root" rev-parse --absolute-git-dir)
state_root="${TMPDIR:-/tmp}/pi-stage-review-commit"
repo_id=$(printf '%s' "$git_dir" | git -C "$root" hash-object --stdin)
repo_state_dir="$state_root/$repo_id"
stamp=$(date -u '+%Y%m%dT%H%M%SZ')
session_id="${stamp}-$$"
session_dir="$repo_state_dir/$session_id"
backup_ref="refs/backup/pi-stage-review/$session_id/tracked"
current_file="$repo_state_dir/current"
sessions_log="$repo_state_dir/sessions.log"
previous_session='none'

if [[ -f "$current_file" ]]; then
  previous_session=$(head -n 1 "$current_file")
fi

mkdir -p "$session_dir"

git -C "$root" rev-parse HEAD >"$session_dir/original-head.txt"
git -C "$root" status --short >"$session_dir/original-status.txt"
git -C "$root" diff --binary >"$session_dir/original-unstaged.patch"
git -C "$root" diff --cached --binary >"$session_dir/original-staged.patch"

stash_sha=$(git -C "$root" stash create "stage-review-commit $session_id")
if [[ -n "$stash_sha" ]]; then
  git -C "$root" update-ref "$backup_ref" "$stash_sha"
else
  backup_ref='none (no tracked changes)'
fi

untracked_list="$session_dir/untracked-files.zlist"
git -C "$root" ls-files --others --exclude-standard -z >"$untracked_list"

untracked_archive='none'
if [[ -s "$untracked_list" ]]; then
  untracked_archive="$session_dir/untracked.tar.gz"
  (
    cd "$root"
    tar -czf "$untracked_archive" --null -T "$untracked_list"
  )
fi

cat >"$session_dir/state.md" <<EOF
# Stage review session

- Session: $session_id
- Repository: $root
- Original HEAD: $(git -C "$root" rev-parse HEAD)
- Tracked backup: $backup_ref
- Untracked archive: $untracked_archive
- Previous session: $previous_session
- Status: snapshot-created

## Plan

Pending.

## Current candidate

None.

## Completed commits

None.
EOF

printf '%s\t%s\t%s\n' "$stamp" "$session_id" "$root" >>"$sessions_log"
printf '%s\n' "$session_id" >"$current_file"

if [[ "$previous_session" != 'none' ]]; then
  printf 'warning: session pointer moved from %s; prior artifacts remain available\n' \
    "$previous_session" >&2
fi

printf 'session_id=%s\n' "$session_id"
printf 'state_root=%s\n' "$state_root"
printf 'session_dir=%s\n' "$session_dir"
printf 'backup_ref=%s\n' "$backup_ref"
printf 'untracked_archive=%s\n' "$untracked_archive"
