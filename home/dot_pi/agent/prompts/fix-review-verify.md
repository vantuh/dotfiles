---
description: Verify the applied fixes (fix-review step 3)
subagent: reviewer
---

A set of review findings was just applied by a worker. The chain context above summarizes what was found and what was changed.

Verify:
1. Each original finding — actually resolved? (check the code, not the report)
2. Did the fixes introduce new defects in the blast radius?
3. Do earlier P1/P2 notes still stand?

Output: per-finding resolved / not-resolved with file:line evidence, any new findings (P0/P1/P2), and end with a line `Merge verdict: OK`, `Merge verdict: OK with notes`, or `Merge verdict: BLOCK`.
