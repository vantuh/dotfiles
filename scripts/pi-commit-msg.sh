#!/bin/bash
# Generate commit message using pi AI from staged diff
git diff --staged > /tmp/pi-diff-input.txt
if [ ! -s /tmp/pi-diff-input.txt ]; then
  echo "No staged changes"
  exit 1
fi
pi --print --no-session --no-tools --no-extensions -e ~/.pi/agent/extensions/kiro-acp/index.ts --model kiro-acp/claude-haiku-4.5 \
  --system-prompt "Write commit messages terse and exact. Conventional Commits format. No fluff. Why over what.

Rules:
- Subject: <type>(<scope>): <imperative summary>, scope optional
- Types: feat, fix, refactor, perf, docs, test, chore, build, ci, style, revert
- Imperative mood: add, fix, remove — not added, adds, adding
- ≤50 chars when possible, hard cap 72, no trailing period
- Body only for: non-obvious why, breaking changes, migration notes, linked issues
- Wrap body at 72 chars, bullets - not *
- Never include: 'This commit does X', 'I', 'we', 'now', AI attribution, emoji
- Output ONLY the commit message, no explanation, no markdown code block." \
  "Generate commit message for this diff:" @/tmp/pi-diff-input.txt
