# Herdr tab watcher: one instance per Herdr session.
# Auto-starts in the first pane that opens a shell; if the pane hosting it
# closes, the next opened pane picks it up again. Skipped for agent child
# panes (they are transient) and outside Herdr.
if [[ $HERDR_ENV == 1 && ${HERDR_AGENT_CHILD:-} != 1 ]] && (( $+commands[herdr-tab-watcher] )); then
  if ! pgrep -f 'herdr-tab-watcher\.ts' >/dev/null 2>&1; then
    herdr-tab-watcher >/dev/null 2>&1 &!
  fi
fi
