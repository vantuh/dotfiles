#!/usr/bin/env bash
set -euo pipefail

herdr="${HERDR_BIN_PATH:-herdr}"
"$herdr" plugin pane open --plugin vantuh.my-usage --entrypoint usage
