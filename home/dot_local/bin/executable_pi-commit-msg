#!/bin/bash
# Generate commit message using pi AI from staged diff.
# Post-processes the model output deterministically: subject line kept as-is
# (trailing period stripped), body reflowed at 72 chars, bullets normalized to "-".
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
- Body only for: non-obvious why, breaking changes, migration notes, linked issues; otherwise no body at all
- Body max 3 sentences / 4 lines; do not narrate every change or restate the diff
- Aim body lines ≤ 70 chars so wrapping never isolates a single word
- Wrap body at 72 chars, bullets - not *
- Never include: 'This commit does X', 'I', 'we', 'now', AI attribution, emoji
- Output ONLY the commit message, no explanation, no markdown code block." \
  "Generate commit message for this diff:" @/tmp/pi-diff-input.txt \
| awk '
# Wrap one pre-formatted line (bullet, indented) longer than 72 at the last
# space before column 72. Never joins short lines.
function wrapline(line,    base, cut, contIndent) {
  match(line, /^ */)
  base = substr(line, 1, RLENGTH)
  contIndent = base
  if (substr(line, base + 1, 2) == "- ")
    contIndent = base "  "
  while (length(line) > 72) {
    cut = 72
    while (cut > length(base) + 1 && substr(line, cut, 1) != " ")
      cut--
    if (cut <= length(base) + 1)
      break  # single word longer than the limit, leave the line unwrapped
    printf "%s\n", substr(line, 1, cut - 1)
    line = contIndent substr(line, cut + 1)
  }
  if (line != "")
    print line
}
# Reflow a run of prose lines: join them and re-wrap greedily at 72, so a
# 75-char model line does not strand a single word on the next line.
function wrappara(text,    joined, i, k, w, line) {
  joined = text
  gsub(/\n/, " ", joined)
  k = split(joined, w, " ")
  line = ""
  for (i = 1; i <= k; i++) {
    if (w[i] == "")
      continue
    if (line == "")
      line = w[i]
    else if (length(line) + 1 + length(w[i]) <= 72)
      line = line " " w[i]
    else {
      print line
      line = w[i]
    }
  }
  if (line != "")
    print line
}
function flushpara() {
  if (para != "") {
    wrappara(para)
    para = ""
  }
}
# Subject: strip trailing period, leave otherwise untouched (no wrapping).
NR == 1 {
  sub(/\.$/, "")
  print
  next
}
# Normalize markdown-style bullets to "-" (only at line start).
/^\* / { sub(/^\* /, "- ") }
# Comments: flush paragraph, pass through untouched.
/^#/ {
  flushpara()
  print
  next
}
# Bullet lines and indented lines: wrap individually, keep structure.
/^- / || /^ / {
  flushpara()
  wrapline($0)
  next
}
# Blank line: paragraph boundary.
/^$/ {
  flushpara()
  print
  next
}
# Prose: accumulate into a paragraph, reflow on boundary.
# First prose line: drop a literal "Body:" label the model sometimes writes.
{
  if (!first_body) {
    sub(/^[Bb]ody: */, "")
    first_body = 1
  }
  if (para == "")
    para = $0
  else
    para = para "\n" $0
}
END { flushpara() }
'
