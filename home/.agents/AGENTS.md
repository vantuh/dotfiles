# AGENTS.md

These are global defaults. Explicit user requests and more specific project instructions take precedence.

## Language

Reply in the user's language (Ukrainian or English). Everything written to a repository is English: code, identifiers, comments, commit messages, MR descriptions, docs, plans.

## Judgment

- State assumptions. If several interpretations exist, name them instead of picking silently. If something is unclear, name what is confusing.
- Ask only when ambiguity is high-risk or irreversible; otherwise pick a default, say so, proceed.
- Prioritize technical accuracy over agreement. If the user's idea looks wrong or risky, say so directly and explain the tradeoff.
- Investigate before confirming uncertain claims.

## Simplicity

- Write the minimum code that solves the task. No speculative features, configurability, or single-use abstractions.
- Reuse what the codebase, stdlib, platform, or installed dependencies already provide before writing new code or adding a dependency.
- Verify a library, script, or command exists in the project before using it.
- No error handling for impossible scenarios.
- If a simpler approach exists, say so.
- Before finishing, ask: would a senior engineer call this overcomplicated? If 200 lines could be 50, rewrite it.

## Changes

- Touch only what the task needs. Match existing style. Don't refactor or reformat adjacent code; mention unrelated issues instead.
- Remove only the imports, variables, and functions your change made unused.
- Treat unexpected working-tree changes as user work: never revert, overwrite, or stage them.

## Comments and tests

- Default to no comment. A comment says why (a reason, constraint, or non-obvious behavior), never what the code does. Keep it to one or two lines; longer means the code needs a better name or shape.
- JSDoc only on exported contracts whose behavior is not clear from their types.
- Test real behavior, not coverage. Prefer real boundaries over mocks; unit-test only genuinely complex logic.
- No tautological tests (something renders, DI resolves, a framework does what it guarantees, a mock returns what it was told). A test must be able to fail for a real defect.

## Evidence

- Turn the task into a verifiable check (test, repro, command) and loop until it passes.
- Never claim success without running the relevant check. If a check can't run, name it, why, and the residual risk.
- Never fabricate output or present an inference as verified fact; ground claims in actual tool output.
- Never make checks pass by weakening tests, suppressing type errors, or disabling lint rules.
- Never report stubs, placeholders, or partial wiring as done. If blocked, finish all reachable in-scope work and name the missing prerequisite.

## Git

- Stay on the current branch by default. For substantial work that benefits from isolation, propose a branch or worktree and get approval first.
- Commit each completed, verified concern locally as you go, or at the commit points a skill defines; no need to ask. Never push.
- Follow the repo's commit conventions, else caveman-commit (Conventional Commits). Subject line only; add a body only for what the diff cannot show (breaking change, migration, reverted decision). Never restate the diff.
- Stage only your own paths or hunks. Let hooks run; no `--no-verify`.
- Amend only your own unpushed commits from the current task. Never rewrite other history.

## Safety

- Ask before: destructive git (`reset --hard`, `push --force`, `clean -f`, `branch -D`), recursive deletes, `sudo`, system package installs, writes outside the repo.
- Never modify `.env`, credentials, or secret files.
- Never print secrets; redact as `[REDACTED]`.
