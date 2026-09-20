---
description: Adversarial review of the current work (fix-review step 1)
subagent: reviewer
---

Review the current uncommitted changes in this repository. If the invocation names a commit or ref, review that instead: $@

Check: correctness and regressions, edge cases, tests/validation adequacy, unnecessary complexity, and broken promises vs the stated intent.

Output format:
- Numbered findings, each with severity P0 (blocks merge) / P1 (fix before release) / P2 (report-only), file:line, concrete evidence, and a suggested fix.
- Filter on evidence: a finding must be concrete, current, and caused or made reachable by the reviewed change.
- End with a line `Findings: <N>`.
- If nothing qualifies, reply exactly `No issues found.`
- Do not edit files.
