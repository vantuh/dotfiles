#!/bin/bash
# link.sh — symlink shared agent skills/instructions to all agents
# Reads links.json for agent paths, links every skill to every agent.
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

# --- Skills: every skill → every agent ---
echo "Linking shared agent skills..."
agent_paths=$(python3 -c "
import json
with open('$MANIFEST') as f:
    data = json.load(f)
for name, path in data['agents'].items():
    print(name + '|' + path)
")

for skill_dir in "$SCRIPT_DIR"/skills/*/; do
  skill_name="$(basename "$skill_dir")"
  while IFS='|' read -r agent_name agent_path; do
    agent_path="${agent_path/#\~/$HOME}"
    # If skills dir is a symlink (e.g. from stow), replace with real dir
    if [[ -L "$agent_path/skills" ]]; then
      rm "$agent_path/skills"
      mkdir -p "$agent_path/skills"
    fi
    do_link "$SCRIPT_DIR/skills/$skill_name" "$agent_path/skills/$skill_name"
  done <<< "$agent_paths"
done

# --- Instructions: explicit targets ---
echo "Linking shared agent instructions..."
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

echo "Done!"
