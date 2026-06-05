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

## Safety Rules

- Never run destructive git commands (`reset --hard`, `push --force`, `clean -f`, `branch -D`) without asking.
- Never run `rm -rf` or recursive deletes without confirmation.
- Don't modify or delete `.env`, credentials, or secret files.
- Don't run `sudo` commands without asking.
- Don't install or remove system packages (brew, apt) without asking.
- Ask before running any command that affects files outside the current repo.

## Tool and subagent use

Prefer direct tools when the target is known: read known files, search known patterns, edit known locations.

Use subagents when the task is large, unfamiliar, multi-file, or likely to require several rounds of exploration/research/review. For broad codebase exploration that would take more than 3 read/grep/find/ls queries, use a scout subagent. For external docs or web research that would take more than 3 searches/queries, use a researcher subagent. Otherwise use direct tools.

Use subagents to parallelize independent investigations or keep large raw results out of the main context. If you delegate research/exploration, do not repeat the same searches yourself; synthesize the returned findings instead. Make delegated prompts self-contained: goal, context, what is already known, expected output, and constraints.

Do not use subagents for obvious single-file edits, direct lookups, or work already handled by another subagent.

Never delegate understanding. Use subagents to gather context, research, plan, or review; the parent agent must synthesize results, decide next steps, and own the final answer. If delegating implementation, provide exact files, constraints, and acceptance criteria rather than “fix based on findings.”

Before delegating, state briefly why delegation is useful and which agent you will use. For borderline cases, ask first.