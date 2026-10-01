#!/bin/sh
# Refresh the mirrored pi-subagents agents from the installed package before
# targets are applied, so the same `chezmoi apply` installs whatever the sync
# changed. `run_before_` is required: chezmoi reads source state after these
# scripts, but `run_after_` changes would only land on the next apply.
set -eu

REPO="${CHEZMOI_SOURCE_DIR%/home}"
SYNC="$CHEZMOI_DEST_DIR/.local/bin/subagents-agents-sync.ts"

[ -x "$(command -v bun)" ] || { echo "skip subagents agent sync: bun not found"; exit 0; }
[ -f "$SYNC" ] || { echo "skip subagents agent sync: $SYNC missing"; exit 0; }

status=0
out="$(bun "$SYNC" "$REPO" 2>&1)" || status=$?
printf '%s\n' "$out"

case "$status" in
  0) ;;
  1) echo "subagents agent sync reported conflicts; resolve home/dot_pi/agent/agents/*.conflict.md" >&2 ;;
  *) echo "subagents agent sync failed; install left untouched" >&2; exit "$status" ;;
esac