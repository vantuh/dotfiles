#!/usr/bin/env bash
set -euo pipefail

herdr="${HERDR_BIN_PATH:-herdr}"
"$herdr" plugin pane open --plugin vantuh.nvim-cheatsheet --entrypoint cheatsheet
