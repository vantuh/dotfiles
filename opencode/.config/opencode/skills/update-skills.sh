#!/bin/bash
# update-skills.sh — update agent skills from GitHub sources
# Usage: ./update-skills.sh [skill-name]
# Without arguments: updates all skills from skills.json

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILLS_DIR="$SCRIPT_DIR"
MANIFEST="$SKILLS_DIR/skills.json"
TMPDIR=$(mktemp -d)

trap 'rm -rf "$TMPDIR"' EXIT

if [[ ! -f "$MANIFEST" ]]; then
  echo "Error: skills.json not found in $SKILLS_DIR"
  exit 1
fi

FILTER="$1"

# Parse repos from manifest
repos=$(python3 -c "
import json, sys
with open('$MANIFEST') as f:
    data = json.load(f)
for repo in data['skills']:
    print(repo)
")

for repo in $repos; do
  echo "Fetching $repo..."
  repo_dir="$TMPDIR/$(echo "$repo" | tr '/' '_')"
  git clone --depth 1 --quiet "https://github.com/$repo.git" "$repo_dir"

  # Parse skills for this repo
  skills=$(python3 -c "
import json
with open('$MANIFEST') as f:
    data = json.load(f)
for s in data['skills']['$repo']:
    only = '|'.join(s.get('only', []))
    vf = s.get('version_file', '')
    print(s['name'] + '|' + s['path'] + '|' + only + '|' + vf)
")

  while IFS='|' read -r name path only_files version_file; do
    if [[ -n "$FILTER" && "$name" != "$FILTER" ]]; then
      continue
    fi

    src="$repo_dir/$path"
    dst="$SKILLS_DIR/$name"

    if [[ ! -d "$src" ]]; then
      echo "  [$name] source path not found: $path — skipping"
      continue
    fi

    # Build hash from only relevant files
    if [[ -n "$only_files" ]]; then
      # Hash only specified files
      old_hash=""
      new_hash=""
      IFS='|' read -ra FILES <<< "$only_files"
      if [[ -d "$dst" ]]; then
        old_hash=$(cd "$dst" && for f in "${FILES[@]}"; do [[ -f "$f" ]] && cat "$f"; done | shasum | cut -d' ' -f1)
      fi
      new_hash=$(cd "$src" && for f in "${FILES[@]}"; do [[ -f "$f" ]] && cat "$f"; done | shasum | cut -d' ' -f1)
    else
      # Hash all files
      old_hash=""
      new_hash=""
      if [[ -d "$dst" ]]; then
        old_hash=$(cd "$dst" && find . -type f -not -name '.DS_Store' | sort | xargs cat | shasum | cut -d' ' -f1)
      fi
      new_hash=$(cd "$src" && find . -type f -not -name '.DS_Store' | sort | xargs cat | shasum | cut -d' ' -f1)
    fi

    if [[ "$old_hash" == "$new_hash" ]]; then
      echo "  [$name] up to date"
    else
      rm -rf "$dst"
      mkdir -p "$dst"

      if [[ -n "$only_files" ]]; then
        # Copy only specified files
        IFS='|' read -ra FILES <<< "$only_files"
        for f in "${FILES[@]}"; do
          [[ -f "$src/$f" ]] && cp "$src/$f" "$dst/$f"
        done
      else
        cp -r "$src"/* "$dst"/
      fi

      # Ensure SKILL.md exists (rename if source uses different name)
      if [[ ! -f "$dst/SKILL.md" ]]; then
        skill_file=$(find "$dst" -maxdepth 1 -iname "skill.md" -o -iname "skill*.md" | head -1)
        [[ -n "$skill_file" ]] && mv "$skill_file" "$dst/SKILL.md"
      fi

      echo "  [$name] updated"

      # Save version if version_file specified
      if [[ -n "$version_file" && -f "$repo_dir/$version_file" ]]; then
        ver=$(grep -m1 'version' "$repo_dir/$version_file" | sed 's/.*"\(.*\)".*/\1/')
        [[ -n "$ver" ]] && echo "$ver" > "$dst/.version"
      fi
    fi
  done <<< "$skills"
done

echo ""
echo "Done!"
