#!/bin/sh
# pi-subagents 0.76.1 drops child message_update before events.jsonl.
# `pi update` replaces the package, so re-apply on every chezmoi apply.
# Already-running Pi processes keep the old module until restart.
set -eu

pkg="${CHEZMOI_DEST_DIR}/.pi/agent/npm/node_modules/pi-subagents"
file="$pkg/src/runs/background/run-child-session.js"
patch="${CHEZMOI_SOURCE_DIR}/dot_pi/agent/patches/pi-subagents-persist-message-update.patch"

if [ ! -f "$file" ]; then
  echo "skip pi-subagents message_update patch: package not installed"
  exit 0
fi
if [ ! -f "$patch" ]; then
  echo "pi-subagents message_update patch missing: $patch" >&2
  exit 1
fi

if ! grep -q 'function shouldPersistChildEvent' "$file"; then
  if grep -q 'event.type !== "message_update"' "$file"; then
    echo "pi-subagents still drops message_update, but shouldPersistChildEvent is gone; patch is stale" >&2
    exit 1
  fi
  echo "pi-subagents message_update patch already applied"
  exit 0
fi

( cd "$pkg" && patch -p1 < "$patch" )
if grep -q 'function shouldPersistChildEvent' "$file"; then
  echo "pi-subagents message_update patch did not remove the filter" >&2
  exit 1
fi
echo "applied pi-subagents message_update patch"
