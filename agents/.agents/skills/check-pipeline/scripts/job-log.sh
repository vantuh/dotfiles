#!/usr/bin/env bash
# Fetch a GitLab CI job log, strip runner noise, save the full text to a file
# and print only the tail. Runner logs are mostly cache/docker/artifact chatter;
# the real failure is almost always in the last lines, and the saved file lets
# you grep for more without pulling tens of thousands of lines into context.
#
# Usage:
#   job-log.sh <job-id> [tail-lines]           # inside the target repo
#   PROJECT=<group%2Fsub%2Frepo> GLAB_HOSTNAME=gitlab.example.com job-log.sh …
#
# Env:
#   PROJECT        URL-encoded project path or numeric ID. Defaults to the repo in
#                  the current directory (glab's `:id` placeholder).
#   GLAB_HOSTNAME  GitLab host. Only needed outside a Git repo, where glab would
#                  otherwise fall back to gitlab.com and return 401.
set -euo pipefail

job_id=${1:?usage: job-log.sh <job-id> [tail-lines]}
tail_lines=${2:-120}
project=${PROJECT:-:id}

out="${TMPDIR:-/tmp}/glab-job-${job_id}.log"

fetch_trace() {
  local path="projects/${project}/jobs/${job_id}/trace"
  if [ -n "${GLAB_HOSTNAME:-}" ]; then
    glab api --hostname "$GLAB_HOSTNAME" "$path"
  else
    glab api "$path"
  fi
}

fetch_trace \
  | perl -pe '
      s/\r$//;                                         # trailing CR
      s/\e\[[0-9;]*[A-Za-z]//g;                        # ANSI escapes
      s/^\d{4}-\d\d-\d\dT[0-9:.]+Z\s+\d\d[OE]\+?\s?//; # per-line timestamp + stream tag
      s/\r/\n/g;                                       # embedded CRs from progress output
    ' \
  | { grep -Ev '^section_(start|end):[0-9]+:' || true; } \
  | cat -s > "$out"

total=$(wc -l < "$out" | tr -d ' ')
if [ "$total" -eq 0 ]; then
  echo "### job ${job_id}: trace is empty (job may not have started, or the log expired)"
  exit 0
fi
echo "### job ${job_id}: ${total} lines cleaned -> ${out}"
echo "### last ${tail_lines} lines:"
tail -n "$tail_lines" "$out"
