#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=env.sh
source "$root/scripts/env.sh"
setup_plugin_path

my_usage_pid=""
esc_watcher_pid=""

stop_my_usage() {
  if [[ -n "$esc_watcher_pid" ]] && kill -0 "$esc_watcher_pid" 2>/dev/null; then
    kill "$esc_watcher_pid" 2>/dev/null || true
    wait "$esc_watcher_pid" 2>/dev/null || true
    esc_watcher_pid=""
  fi
  if [[ -n "$my_usage_pid" ]] && kill -0 "$my_usage_pid" 2>/dev/null; then
    kill -INT "$my_usage_pid" 2>/dev/null || true
    wait "$my_usage_pid" 2>/dev/null || true
    my_usage_pid=""
  fi
}

trap stop_my_usage EXIT

is_lone_escape() {
  local next=""
  if IFS= read -rsn1 -t 0.03 next < /dev/tty 2>/dev/null && [[ -n "$next" ]]; then
    return 1
  fi
  return 0
}

start_esc_watcher() {
  (
    sleep 0.2
    while kill -0 "$my_usage_pid" 2>/dev/null; do
      local key=""
      if IFS= read -rsn1 -t 0.2 key < /dev/tty 2>/dev/null; then
        if [[ "$key" == $'\e' ]] && is_lone_escape; then
          kill -INT "$my_usage_pid" 2>/dev/null || true
          exit 0
        fi
      fi
    done
  ) &
  esc_watcher_pid=$!
}

wait_for_dismiss() {
  printf '\nPress Enter or Esc to close.\n'
  if [[ ! -r /dev/tty ]]; then
    sleep 3
    return
  fi

  local key=""
  while true; do
    if ! IFS= read -rsn1 key < /dev/tty 2>/dev/null; then
      sleep 0.2
      continue
    fi
    if [[ -z "$key" ]]; then
      break
    fi
    if [[ "$key" == $'\e' ]] && is_lone_escape; then
      break
    fi
  done
}

if [[ ! -r /dev/tty ]]; then
  run_my_usage
  exit $?
fi

my_usage_pid="$(start_my_usage)" || {
  sleep 3
  exit 1
}
printf 'Press Esc to cancel.\n' >&2
start_esc_watcher

set +e
wait "$my_usage_pid"
exit_code=$?
set -e
my_usage_pid=""
if [[ -n "$esc_watcher_pid" ]]; then
  kill "$esc_watcher_pid" 2>/dev/null || true
  wait "$esc_watcher_pid" 2>/dev/null || true
  esc_watcher_pid=""
fi
trap - EXIT

if [[ $exit_code -eq 130 ]]; then
  printf '\n(cancelled)\n'
  exit 130
fi

if [[ $exit_code -ne 0 ]]; then
  sleep 3
  exit "$exit_code"
fi

wait_for_dismiss
