#!/usr/bin/env bash
# Print the resolved definition of one CI job — image, variables, before_script, script.
#
# When a project's .gitlab-ci.yml composes shared configuration with `include:`,
# the local file does not show what a job actually runs; the definition lives in
# the included template. `glab ci config compile` resolves every `include:`, and
# this script pulls one job out of the merged result so you can reproduce it
# locally instead of guessing from package.json or a build file.
#
# Two caveats worth knowing before you trust the output:
#
#   1. compile resolves `include:` but does NOT flatten `extends:`. A job may
#      still carry `extends: ".parent"` (hidden jobs are printed with a quoted
#      key). GitLab merges parent into child: the child's own `script:` wins,
#      and only when the child has none does the parent's apply. So read the
#      child's script if it has one, and follow the chain when it doesn't —
#      parents often hold abstract placeholders such as
#      `echo "ERROR: Base lint script is not implemented"`.
#
#   2. The output describes the configuration as it is now. Remote includes can
#      change without the local file changing, and an older pipeline may have
#      run something else. The job log remains the source of truth for what a
#      given run executed.
#
# Usage:
#   job-recipe.sh <job-name>        # e.g. job-recipe.sh linter
#   job-recipe.sh                   # list job names (hidden .jobs excluded)
#   job-recipe.sh '".parent"'       # inspect a hidden job, quotes included
#
# Env:
#   REFRESH=1  Force re-compile, ignoring the cached copy. Use this at the start
#              of a diagnosis and after any change to CI configuration.
set -euo pipefail

root=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
# Key the cache on the repo path AND the local CI config, so editing
# .gitlab-ci.yml never yields a stale `script:`.
sig=$(printf '%s\n' "$root"; cat "$root/.gitlab-ci.yml" 2>/dev/null || true)
key=$(printf '%s' "$sig" | cksum | tr -cd '0-9')
cache="${TMPDIR:-/tmp}/glab-ci-compiled-${key:-default}.yml"

# The key cannot see remote `include:` changes, so also expire the cache by age:
# fresh enough to serve repeated lookups within one diagnosis, stale enough that
# a later session recompiles.
fresh=""
if [ -s "$cache" ] && [ -z "${REFRESH:-}" ]; then
  fresh=$(find "$cache" -mmin -15 2>/dev/null || true)
fi
if [ -z "$fresh" ]; then
  glab ci config compile > "$cache"
fi

# Top-level keys that are configuration, not jobs.
not_a_job='^(variables|stages|default|workflow|cache|include|image|services|before_script|after_script)$'

if [ $# -eq 0 ]; then
  echo "### jobs in $cache:"
  awk -v skip="$not_a_job" '
    /^[^[:space:]#].*:[[:space:]]*$/ {
      key = $0
      sub(/:[[:space:]]*$/, "", key)
      # Hidden jobs and other quoted keys are emitted with surrounding quotes.
      if (key ~ /^".*"$/) { sub(/^"/, "", key); sub(/"$/, "", key) }
      # Skip reserved keys and hidden (dot-prefixed) template jobs.
      if (key !~ skip && key !~ /^\./) print key
    }
  ' "$cache"
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
