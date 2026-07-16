#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=env.sh
source "$root/scripts/env.sh"
setup_plugin_path

wait_to_close() {
  printf '\nPress Enter to close.\n'
  if [[ -r /dev/tty ]]; then
    read -r _ < /dev/tty || sleep 3
  else
    sleep 3
  fi
}

if ! run_my_usage; then
  wait_to_close
  exit 1
fi

wait_to_close
