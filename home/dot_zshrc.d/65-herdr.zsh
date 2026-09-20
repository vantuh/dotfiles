# Herdr tab watcher: one instance per Herdr server (socket).
# Auto-starts in the first pane that opens a shell; if the pane hosting it
# closes, the next opened pane picks it up again. Skipped for agent child
# panes (they are transient) and outside Herdr.
#
# Mutual exclusion via a zsh/system flock held by the watcher process itself:
# the subshell takes the lock and then exec's the watcher, so the lock lives
# and dies with the watcher process — pid files, retry loops and stale-lock
# cleanup are not needed, and concurrent pane startups cannot spawn duplicates.
if [[ $HERDR_ENV == 1 && ${HERDR_AGENT_CHILD:-} != 1 ]] \
   && [[ -x $HOME/.local/bin/herdr-tab-watcher.ts ]] \
   && zmodload zsh/system 2>/dev/null; then
  () {
    local lock="${HERDR_SOCKET_PATH:-${TMPDIR:-/tmp}/herdr-tab-watcher}.lock"
    local fd
    : > "$lock"
    (
      zsystem flock -t 0 -e -f fd "$lock" 2>/dev/null || exit 0
      exec "$HOME/.local/bin/herdr-tab-watcher.ts" >/dev/null 2>&1
    ) &!
  }
fi
