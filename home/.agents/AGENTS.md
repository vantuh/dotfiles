# AGENTS.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## Language

The user is a native Ukrainian speaker and reads English fluently. Answer in the language the user writes in: if they write in Ukrainian, reply, ask clarifying questions, and summarize in Ukrainian; the same for English.

Ukrainian is for the chat only. Everything that lands in a repository is English, even when the request came in Ukrainian: code, identifiers, comments, commit messages, PR/MR descriptions, and any documentation you're asked to write (README, docs, ADRs, specs, plan files).

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask. If the uncertainty is low-risk and reversible, state the assumption and proceed cautiously.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something important is unclear, stop. Name what's confusing. Ask.

## Professional objectivity

Prioritize technical accuracy over agreement. If the user's idea looks wrong or risky, say so directly, explain the tradeoff, and investigate before confirming uncertain claims.

## Existing-project discipline

Before using a library, framework, command, or test script, verify it exists in the project: check neighboring files, imports, package/config files, README, or documented scripts. Prefer editing existing files over creating new ones; create files only when necessary for the requested outcome.

- Follow loaded project instructions. When instructions conflict, the more specific file nearest the code being changed takes precedence.

## Code Style

These are defaults for TypeScript, React, and NestJS. Existing project conventions and configured compiler, linter, and formatter rules take precedence. Do not rewrite unchanged code solely to impose these preferences.

### TypeScript

- Do not introduce `any`. Use `unknown` at untrusted boundaries and narrow it before use. If an external declaration exposes `any`, contain it behind an accurately typed local boundary.
- Give exported APIs and framework boundaries explicit parameter and return types; allow inference for obvious local implementation details. **NEVER use `ReturnType<>`** to avoid naming a contract — use the actual type name.
- Keep imports at module scope. **NEVER use inline type imports** such as `import("pkg").Type` or dynamic type imports. Runtime `import()` is allowed only for deliberate lazy loading or code splitting supported by the existing project, never as a convenience.
- Inspect the installed package's declarations or source, including `node_modules`, for external API types instead of guessing them.
- Prefer narrowing, type guards, schema validation, and `satisfies` over `as` assertions or non-null `!`. Use an assertion only when the runtime invariant is already proven and the API cannot express it; explain non-obvious cases.
- Use `readonly` for data that crosses public boundaries and must not be mutated. Local mutation is acceptable when it does not escape and is clearer or avoids needless allocation.
- Use barrel files only as intentional package or feature public APIs. Use direct imports within an implementation and avoid chains of barrel re-exports.
- Prefer guard clauses and early returns over deep nesting. Avoid positional boolean arguments; use separate functions or a named options object when a boolean selects behavior.
- String enums are allowed when a runtime enum object is useful. Do not replace existing string enums solely to impose a union or const-object preference.
- Use JSDoc for exported reusable contracts when their behavior is not clear from their types. Comments should explain reasons, constraints, and non-obvious decisions, not narrate the code.
- Catch errors only to recover, translate, or add useful context. Preserve the original error with `cause`; do not catch and rethrow without adding value.

### React

- Use function components and hooks unless existing code requires a class component.
- Keep one primary exported component per `.tsx` file. Cohesive private subcomponents and helpers may stay alongside it, but define components at module scope, never inside another component.
- Use effects only to synchronize with external systems. Derive values during rendering and handle user-triggered work in event handlers; do not mirror derived data in state.
- Do not add `memo`, `useMemo`, `useCallback`, or custom equality checks reflexively. Optimize after profiling or when a concrete identity requirement makes it necessary.
- Prefer semantic HTML. Interactive UI must have accessible names and keyboard behavior; add ARIA only where native semantics are insufficient.

### NestJS

- Keep controllers limited to transport concerns and delegate business behavior to providers or services.
- Validate and transform untrusted input at the application boundary using the project's existing validation system. With `ValidationPipe` and decorator-based validation, DTOs must be concrete classes imported as runtime values, not type-only imports.
- Use constructor injection for managed dependencies. Do not instantiate providers manually or use a service locator. Resolve circular dependencies through clearer module boundaries or events instead of adding `forwardRef()` by default.
- Use guards for authorization, pipes for validation and transformation, interceptors for cross-cutting request behavior, and filters for exception mapping.
- Follow the project's established error model, persistence boundaries, and validation library. Do not introduce a second validation stack, repository abstraction, or exception hierarchy by default.

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

Treat unexpected or unrelated repository changes as user work: preserve them, don't revert or overwrite them, and don't stage or include them in your commits unless asked.

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

## Evidence and Completion

**Do not claim success without evidence. Finish the requested outcome, not a plausible subset.**

- Never fabricate output or present an inference as verified fact; ground claims in actual tool output.
- Do not silently reduce scope or report stubs, placeholders, no-ops, fake fallbacks, or partially connected scaffolding as completed work. If blocked, finish all reachable in-scope work and name the missing prerequisite precisely.
- If a required or relevant check cannot run, state the exact check not run, why, and any residual risk.
- Don't make checks pass by weakening tests, suppressing type errors, or disabling lint rules instead of fixing the underlying issue.

## Incremental commits

**For non-trivial work spanning multiple verifiable concerns, commit each completed concern as you go instead of accumulating one large diff.** A trivial single-concern task needs at most one commit.

- One independently reviewable concern per commit, including the tests and docs that make it complete. Order dependencies before dependents. Follow the repository's existing subject style (check recent `git log`).
- Subject line only. Do not add a commit body, extended description, trailers, or a "why / what / how tested" paragraph — the subject already states the concern, and the diff shows the rest. A body is the exception, and only when omitting it would hide something the diff does not show: a breaking change, a reverted decision, or a non-obvious constraint a future reader would otherwise get wrong. If you are unsure whether a body is necessary, it is not.
- Commit a slice once it is coherent and every available check relevant to it passes. If no check exists or a relevant one can't run, say so and don't imply it passed. Never commit a state you know is broken — keep working until the slice stands on its own.
- This is standing authorization to create local commits: don't ask before each one. Never push — the user pushes.
- Stay on the current branch, including default/`main`. Do not create a feature or task branch unless the user explicitly asks. Commits on `main` are authorized.
- Check status and diffs first, then stage only your own paths or hunks — never a whole file just because you touched it (see Surgical Changes). If your edits can't be separated from pre-existing changes in the same file, don't commit them; report the overlap.
- Let commit hooks run; no `--no-verify` unless the user asks. Amending your own unpushed commit from the current task is fine (e.g. a hook reformatted files); otherwise fix mistakes with new commits and never rewrite pre-existing history unless the user asks.

## Safety Rules

- Never run destructive git commands (`reset --hard`, `push --force`, `clean -f`, `branch -D`) without asking.
- Never run `rm -rf` or recursive deletes without confirmation.
- Don't modify or delete `.env`, credentials, or secret files.
- Never expose secrets, credentials, tokens, or connection strings in output; don't echo them into responses, commits, or logs — redact encountered values as `[REDACTED]`.
- Don't run `sudo` commands without asking.
- Don't install or remove system packages (brew, apt) without asking.
- Ask before running any command that affects files outside the current repo.

## Tool use

Prefer direct tools when the target is known: read known files, search known patterns, edit known locations. If a file changed after reading it, or a tool reports stale context, re-read the relevant section before retrying instead of repeating the same failed edit against stale state.

## Delegation

Use the host's specialist agents and spawn tool. Follow the types, spawn policy, and mechanics it listed this session; do not invent flags, runtimes, or role names it did not provide. Honor explicit user requests like "use scout" or "send to reviewer" when that specialist exists.

When the host prefers or requires delegation, do that — don't keep work in the parent because the task looks small or the context is already fresh. The parent still owns the plan: scout unknown areas first, plan yourself, then implement as the host's spawn policy says. Child tasks must be self-contained. Parallelize only independent reads or disjoint writes. The parent synthesizes output, integrates changes, and owns final verification.

## Parallel sessions

If this host can message other live agent sessions (hub, intercom, or similar), use that to coordinate — don't reconstruct the same facts in isolation when a peer already has them.

When: same codebase (parallel work), a reference codebase (patterns), related repos (shared libraries).
Not when: unrelated work, trivial questions, or you can proceed independently.

Discover the live roster first; address peers by their exact names. Prefer a one-way send for notifications; wait for a reply only when blocked. The user is not a peer — talk to them in the chat, not through session messaging.
