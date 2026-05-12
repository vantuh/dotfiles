# AGENTS.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask. If the uncertainty is low-risk and reversible, state the assumption and proceed cautiously.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something important is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

## 5. Subagents workflow

Use `pi-subagents` proactively when available and when it reduces context or improves quality. Do not use subagents for trivial one-step tasks.

- `scout`: unfamiliar code exploration, relevant files, code flow, concise `context.md`.
- `context-builder`: larger/ambiguous tasks that need complete handoff context.
- `planner`: implementation plan after context is gathered; must not edit files.
- `worker`: focused implementation after a clear plan.
- `reviewer`: review non-trivial diffs; may apply only trivial safe fixes.
- `oracle`: risky architectural decisions or second opinion.
- `researcher`: external docs, changelogs, APIs, recent package behavior.
- `delegate`: small generic tasks that do not fit other agents.

For bigger coding tasks, prefer:

`scout/context-builder -> planner -> worker -> reviewer`

Keep parent context small. Subagents should return concise handoff summaries, relevant files, risks, and next steps instead of large file dumps.

After non-trivial implementation, run `reviewer` before the final summary.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

## Safety Rules

- Never run destructive git commands (`reset --hard`, `push --force`, `clean -f`, `branch -D`) without asking.
- Never run `rm -rf` or recursive deletes without confirmation.
- Don't modify or delete `.env`, credentials, or secret files.
- Don't run `sudo` commands without asking.
- Don't install or remove system packages (brew, apt) without asking.
- Ask before running any command that affects files outside the current repo.