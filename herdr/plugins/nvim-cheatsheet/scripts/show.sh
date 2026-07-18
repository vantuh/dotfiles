#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
# herdr/plugins/nvim-cheatsheet -> ../../../nvim/COMMANDS.md
commands_md="$(cd "$root/../../.." && pwd)/nvim/COMMANDS.md"

if [[ ! -f "$commands_md" ]]; then
  printf 'COMMANDS.md not found:\n  %s\n\nPress Enter to close.\n' "$commands_md"
  if [[ -r /dev/tty ]]; then
    read -r _ < /dev/tty || true
  else
    sleep 3
  fi
  exit 1
fi

# Always page via less so / search and n/N work (glow -p uses its own pager).
export LESS="${LESS:--R}"
# Prompt hint: / search, n next, q quit
export LESS_TERMCAP_mb=$'\e[1;31m'
export LESS_TERMCAP_md=$'\e[1;36m'
export LESS_TERMCAP_me=$'\e[0m'
export LESS_TERMCAP_se=$'\e[0m'
export LESS_TERMCAP_so=$'\e[1;44;33m'
export LESS_TERMCAP_ue=$'\e[0m'
export LESS_TERMCAP_us=$'\e[1;32m'

if command -v glow >/dev/null 2>&1; then
  exec glow -w "${COLUMNS:-100}" "$commands_md" | less -R --prompt='nvim cheatsheet  / search  n next  N prev  q quit'
fi

exec less -R --prompt='nvim cheatsheet  / search  n next  N prev  q quit' "$commands_md"
