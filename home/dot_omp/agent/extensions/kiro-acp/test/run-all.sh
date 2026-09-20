#!/bin/bash
# Runs every kiro-acp test under bun (omp's actual extension runtime).
# Usage: test/run-all.sh [test-file ...]
set -u

cd "$(dirname "$0")/.." || exit 1

# Source and test files import pi packages (@earendil-works/pi-ai; omp remaps
# that scope at extension-load time, but standalone `bun test/...` needs the
# real tree). pi's vendored node_modules provides them — see .gitignore.
PI_NODE_MODULES="${PI_NODE_MODULES:-$(npm root -g)/@earendil-works/pi-coding-agent/node_modules}"

if [ ! -d "$PI_NODE_MODULES" ]; then
	echo "pi-coding-agent node_modules not found at $PI_NODE_MODULES" >&2
	echo "Set PI_NODE_MODULES to pi's vendored node_modules directory." >&2
	exit 1
fi

# Expose pi's dependency tree via a node_modules symlink (gitignored).
if [ ! -e node_modules ] && [ ! -L node_modules ]; then
	ln -s "$PI_NODE_MODULES" node_modules
fi

if [ "$#" -gt 0 ]; then
	files=("$@")
else
	files=(test/*.test.ts)
fi

failures=()
for file in "${files[@]}"; do
	printf '\n\033[1m── %s\033[0m\n' "$file"
	if ! bun "$file"; then
		failures+=("$file")
	fi
done

printf '\n'
if [ "${#failures[@]}" -gt 0 ]; then
	echo "✗ ${#failures[@]}/${#files[@]} test files failed:"
	for file in "${failures[@]}"; do echo "  - $file"; done
	exit 1
fi
echo "✓ all ${#files[@]} test files passed"
