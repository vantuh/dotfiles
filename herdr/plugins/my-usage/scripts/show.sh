#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=env.sh
source "$root/scripts/env.sh"
setup_plugin_path

my_usage_pid=""

stop_my_usage() {
  if [[ -z "$my_usage_pid" ]] || ! kill -0 "$my_usage_pid" 2>/dev/null; then
    return
  fi
  kill -INT "$my_usage_pid" 2>/dev/null || true
  wait "$my_usage_pid" 2>/dev/null || true
  my_usage_pid=""
}

trap stop_my_usage EXIT

wait_for_esc_while_running() {
  local key
  while kill -0 "$my_usage_pid" 2>/dev/null; do
    if IFS= read -rsn1 -t 0.1 key < /dev/tty 2>/dev/null; then
      if [[ "$key" == $'\e' ]]; then
        printf '\n(cancelled)\n'
        stop_my_usage
        trap - EXIT
        exit 130
      fi
    fi
  done
}

wait_for_dismiss() {
  printf '\nPress Enter or Esc to close.\n'
  if [[ ! -r /dev/tty ]]; then
    sleep 3
    return
  fi

  local key
  while true; do
    IFS= read -rsn1 key < /dev/tty || break
    if [[ -z "$key" || "$key" == $'\e' ]]; then
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

wait_for_esc_while_running

set +e
wait "$my_usage_pid"
exit_code=$?
set -e
my_usage_pid=""
trap - EXIT

if [[ $exit_code -ne 0 ]]; then
  sleep 3
  exit "$exit_code"
fi

wait_for_dismiss
