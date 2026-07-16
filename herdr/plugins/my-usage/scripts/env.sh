#!/usr/bin/env bash
# Herdr plugin panes get a stripped PATH; restore common tool locations.
setup_plugin_path() {
  local dir
  for dir in \
    "$HOME/.local/bin" \
    "/opt/homebrew/bin" \
    "/usr/local/bin" \
    "$HOME/.bun/bin" \
    "$HOME/.cargo/bin" \
    "$HOME/.npm-global/bin"
  do
    [[ -d "$dir" ]] && PATH="$dir:$PATH"
  done
  export PATH
}

resolve_my_usage_bin() {
  local bin="${MY_USAGE_BIN:-}"
  if [[ -z "$bin" ]]; then
    bin="$(command -v my-usage 2>/dev/null || true)"
  fi
  if [[ -z "$bin" && -f "$HOME/.local/bin/my-usage" ]]; then
    bin="$HOME/.local/bin/my-usage"
  fi
  if [[ -z "$bin" ]]; then
    echo "my-usage not found in PATH"
    echo "Stow the zsh package or set MY_USAGE_BIN in plugin config." >&2
    return 1
  fi
  printf '%s' "$bin"
}

run_my_usage() {
  local bin shell
  bin="$(resolve_my_usage_bin)" || return 1
  shell="${SHELL:-/bin/zsh}"
  "$shell" -lic "$bin"
}

start_my_usage() {
  local bin shell
  bin="$(resolve_my_usage_bin)" || return 1
  shell="${SHELL:-/bin/zsh}"
  "$shell" -lic "$bin" &
  printf '%s' $!
}
