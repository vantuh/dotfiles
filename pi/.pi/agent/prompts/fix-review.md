---
description: Review → apply fixes → verify (bounded pipeline)
chain: fix-review-findings -> fix-review-apply --with-context -> fix-review-verify
---

Runs a reviewer over the current work, delegates the fixes to a worker (with proof-of-work acceptance), then has a fresh reviewer verify every finding was actually resolved. Add a commit or ref as the argument to review that instead of the working tree.
