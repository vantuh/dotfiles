#!/usr/bin/env bash
# Pi Pocket's local-dictation extension imports one native npm package from here, so the tree has to be installed once
# per machine. node_modules stays out of the source state (see .chezmoiignore.tmpl) and is created on the first apply.
set -u

app_dir="{{ .chezmoi.destDir }}/.local/share/pi-dictation"
[[ -f "$app_dir/package.json" ]] || exit 0
[[ -d "$app_dir/node_modules" ]] && exit 0

if ! command -v bun >/dev/null 2>&1; then
  printf 'skip pi-dictation dependencies: bun not found\n' >&2
  exit 0
fi

( cd "$app_dir" && bun install ) || printf 'pi-dictation: bun install failed\n' >&2
