#!/usr/bin/env bash
# Print the resolved definition of one CI job — image, variables, script.
#
# Most .gitlab-ci.yml files in this org are a thin `include:` of a shared
# template, so the local file does not show what a job like `linter` actually
# runs. `glab ci config compile` resolves every `include:`; this script pulls one
# job out of the merged result so you can reproduce it locally with the exact
# command CI used, instead of guessing from package.json.
#
# Caveat: compile resolves includes but does NOT flatten `extends:`. A job may
# still carry `extends: ".linter"`, and the parent (a hidden job, printed with a
# quoted key) often holds only an abstract stub such as
# `echo "ERROR: Base lint script is not implemented"`. Always read the concrete
# job's own `script:` — never the parent's — or you will "reproduce" a command
# CI never ran.
#
# Usage:
#   job-recipe.sh <job-name>        # e.g. job-recipe.sh linter
#   job-recipe.sh                   # list job names (hidden .jobs excluded)
#
# Env:
#   REFRESH=1  Force re-compile, ignoring the cached copy.
set -euo pipefail

root=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
# Key the cache on the repo path AND the local CI config, so editing
# .gitlab-ci.yml never yields a stale `script:`.
sig=$(printf '%s\n' "$root"; cat "$root/.gitlab-ci.yml" 2>/dev/null || true)
key=$(printf '%s' "$sig" | cksum | tr -cd '0-9')
cache="${TMPDIR:-/tmp}/glab-ci-compiled-${key:-default}.yml"

if [ ! -s "$cache" ] || [ -n "${REFRESH:-}" ]; then
  glab ci config compile > "$cache"
fi

# Top-level keys that are configuration, not jobs.
not_a_job='^(variables|stages|default|workflow|cache|include|image|services|before_script|after_script)$'

if [ $# -eq 0 ]; then
  echo "### jobs in $cache:"
  sed -n 's/^\([A-Za-z_][A-Za-z0-9_./ -]*\):$/\1/p' "$cache" \
    | { grep -Ev "$not_a_job" || true; }
  exit 0
fi

job=$1
awk -v job="$job" '
  # Match the job key, plain or quoted (hidden jobs are emitted quoted).
  $0 == job":" || $0 == "\"" job "\":" { found = 1; print; next }
  # Stop only at the next top-level YAML key, not at any column-0 line:
  # compiled output contains column-0 list items (e.g. under `stages:`).
  found && /^[^[:space:]#].*:[[:space:]]*$/ { exit }
  found { print }
  END { if (!found) exit 3 }
' "$cache" || {
  echo "job '$job' not found in merged config; run without arguments to list jobs" >&2
  exit 1
}
