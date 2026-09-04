---
description: Apply review findings (fix-review step 2)
subagent: worker
acceptance: checked
---

A reviewer produced findings against the current work. The findings (and a summary of the review) are in the chain context above.

Apply the fixes:
- Fix every P0 and P1 finding. Skip P2 unless trivial, and say so explicitly.
- Do not refactor beyond what the findings require.
- Validate your changes: run the relevant tests/commands and show the results.
- Report each finding as `fixed` or `skipped (reason)`.

If the chain context above contains no findings (the review said "No issues found"), reply exactly `No findings to apply.` and do nothing else.
