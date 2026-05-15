#!/bin/bash
# link.sh — symlink shared agent skills/instructions
# Skills go to global (~/.agents/skills) and kiro (~/.kiro/skills).
# Consumers (pi, opencode, claude) get a directory symlink to global.
# Usage: ./link.sh [--dry-run]

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MANIFEST="$SCRIPT_DIR/links.json"
DRY_RUN=false
[[ "$1" == "--dry-run" ]] && DRY_RUN=true

if [[ ! -f "$MANIFEST" ]]; then
  echo "Error: links.json not found in $SCRIPT_DIR"
  exit 1
fi

do_link() {
  local src="$1" target="$2"
  mkdir -p "$(dirname "$target")"
  local real_target_dir
  real_target_dir=$(realpath "$(dirname "$target")")
  local rel
  rel=$(python3 -c "import os; print(os.path.relpath('$src', '$real_target_dir'))")
  if [[ "$DRY_RUN" == true ]]; then
    echo "  [dry-run] $target -> $rel"
  else
    ln -sfn "$rel" "$target"
    echo "  $target -> $rel"
  fi
}

# --- Skills: symlink all targets to dotfiles/agents/skills ---
echo "Linking skills..."
all_skill_paths=$(python3 -c "
import json
with open('$MANIFEST') as f:
    data = json.load(f)
for path in data['skills'].values():
    print(path)
")

while IFS= read -r target_path; do
  target_path="${target_path/#\~/$HOME}"
  # Remove existing dir/symlink
  if [[ -L "$target_path" ]]; then
    rm "$target_path"
  elif [[ -d "$target_path" ]]; then
    rm -rf "$target_path"
  fi
  do_link "$SCRIPT_DIR/skills" "$target_path"
done <<< "$all_skill_paths"

# --- Instructions: explicit targets ---
echo "Linking instructions..."
instructions=$(python3 -c "
import json
with open('$MANIFEST') as f:
    data = json.load(f)
for name, targets in data.get('instructions', {}).items():
    for t in targets:
        print(name + '|' + t)
")

while IFS='|' read -r name target; do
  [[ -z "$name" ]] && continue
  target="${target/#\~/$HOME}"
  do_link "$SCRIPT_DIR/instructions/$name" "$target"
done <<< "$instructions"

# --- Agents: pi-specific agent definitions ---
echo "Linking agents..."
agents=$(python3 -c "
import json
with open('$MANIFEST') as f:
    data = json.load(f)
for name, path in data.get('agents', {}).items():
    print(name + '|' + path)
")

while IFS='|' read -r name target; do
  [[ -z "$name" ]] && continue
  target="${target/#\~/$HOME}"
  src="$SCRIPT_DIR/../pi/.pi/agent/agents"
  if [[ -L "$target" ]]; then
    rm "$target"
  elif [[ -d "$target" ]]; then
    rm -rf "$target"
  fi
  do_link "$src" "$target"
done <<< "$agents"

echo "Done!"
