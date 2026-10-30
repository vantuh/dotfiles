# Rex reports only later directory changes, so report the start directory
# for session-names.lua, and run that watcher once like the Herdr tab watcher.
if [[ $TERM_PROGRAM == rex ]]; then
  printf '\e]7;file://%s%s\a' "$HOST" "${PWD// /%20}"
  if zmodload zsh/system 2>/dev/null; then
    () {
      local lock="${TMPDIR:-/tmp}/rex-session-names.lock"
      local fd
      : > "$lock"
      (
        zsystem flock -t 0 -e -f fd "$lock" 2>/dev/null || exit 0
        exec rex do --all --autostart=false "$HOME/.config/rex/session-names.lua" >/dev/null 2>&1
      ) &!
    }
  fi
fi
