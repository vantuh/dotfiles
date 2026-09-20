---
name: split-to-commits
description: >
  Split a large dirty working tree into small, logical, sequential git commits — one concern per
  commit. Use whenever the user asks to split commits, break up changes, organize uncommitted work,
  "one commit per feature", logical commit history, розбий на коміти, or wants a big diff turned
  into reviewable commits before push/PR. Also trigger when they have mixed changes across files
  and want commits ordered fixes → features → refactors → tests → docs. Complements split-to-prs
  (commits on one branch) and caveman-commit (message wording only).
---

# Split to Commits

Turn one pile of uncommitted work into a clean, reviewable commit sequence on the current branch.

Each commit should tell a coherent story a reviewer can understand in isolation. The final tree must match what the user already built.

## Hard rules

- **Do not commit until the user explicitly asks.** Planning and staging are fine; `git commit` needs approval.
- **Never discard work.** No `reset --hard`, `clean -fdx`, force-push, or history rewrite without explicit approval.
- **Stage only named files or hunks.** No `git add .` / `git add -A`.
- **One logical concern per commit.** If a commit needs "and also" in the subject, split it.
- **Preserve final state.** After all commits, `git status` must be clean and the tree must match the pre-split combined result.

## When to use this vs split-to-prs

| Situation | Skill |
|-----------|-------|
| Many changes on one branch → several commits, one PR | **split-to-commits** |
| Several independent slices → separate branches/PRs | **split-to-prs** |

These compose: split-to-commits first, then split-to-prs if slices need different PRs.

## 1. Inventory the work

Run in parallel:

```bash
git status
git diff --stat
git diff --cached --stat
git log --oneline -10
```

Read enough diffs to understand slices. Use chat history for intent when the diff alone is ambiguous.

Classify each slice:

- **fix** — bug/parity correction, no new capability
- **feat** — new behavior or API surface
- **refactor** — structure change without behavior change
- **test** — specs only
- **docs** — README, comments meant for users
- **style** — formatting/import order with zero behavior change
- **chore/build/ci** — tooling, deps, config

Flag **mixed files** — files whose hunks belong to multiple slices (module wiring, barrel exports, shared constants, producer/consumer touched by several features).

## 2. Propose the commit plan

Present an ordered list before committing. Default ordering:

1. `fix` — smallest behavioral corrections first
2. `feat` — foundation before consumers (constants → implementation → module wiring → exports)
3. `refactor` — after the code it touches exists
4. `test` — cover features above
5. `style` — import order / formatting-only (separate commit when it would muddy a feature diff)
6. `docs` — last; documents the final API

**Plan format:**

```text
1. fix(producer): use uuid v6 correlations
2. feat(encoding): add compression codecs
3. test: cover encoding and producer changes
4. docs: update README
```

For each mixed file, note **which commit owns which hunks** and the staging strategy (`git add -p` vs whole file).

Ask for approval. Adjust if the user reorders or merges slices.

## 3. Safety snapshot

Before the first commit:

```bash
SHA=$(git stash create "pre-split-commits")
if [ -n "$SHA" ]; then
  git update-ref "refs/backup/pre-split-commits-$(date +%s)" "$SHA"
fi
```

Know the **full final content** of every mixed file before partial staging. You will need it if the worktree corrupts.

## 4. Execute commits sequentially

For each approved slice:

1. Stage only that slice's files/hunks
2. Verify staged content: `git diff --cached --stat` and spot-check `git diff --cached`
3. Commit with Conventional Commits (`caveman-commit` skill for message style)
4. Record: `git log --oneline -1`

**Commit message pattern:** `<type>(<scope>): <imperative summary>`

### Staging strategy (two phases)

**Phase A — features in mixed files** (only when necessary):

- Partial staging (`git add -p` or scripted index updates) so the worktree stays at the final state
- After **every** such commit: `git status --short` + project typecheck on the **worktree** (not just staged)

**Phase B — endgame** (preferred once core features are committed):

- Whole-file commits for new directories (`src/commands/`), test files, README, style-only edits
- Avoid re-partial-staging files that already caused trouble

| Slice | Typical staging |
|-------|-----------------|
| New feature dir | `git add src/feature/` + related export hunks in `package.json`, `tsdown.config.ts`, barrel `index.ts` |
| Tests | all touched `*.spec.ts` files together |
| Style | single file or import-order-only diff |
| Docs | `README.md` alone |

### Pre-commit hooks

`lint-staged` may stash/unstash and rewrite files. After each commit:

- Re-read `git diff` for unexpected worktree drift
- Run typecheck when the project has it

If a check fails, **stop and repair** before the next commit.

## 5. Partial staging — power and risk

Prefer these approaches in order:

### A. Whole-file ownership (safest)

Stage the entire file when all hunks belong to one slice. Use in Phase B and whenever possible in Phase A.

### B. `git add -p` (interactive hunk pick)

Good for small, well-separated hunks. Skip hunks that belong to later commits.

### C. Partial index tricks (last resort)

`git update-index --cacheinfo`, scripted patch application — stage a subset while worktree stays final. **Fragile:**

- Hooks may leave the worktree syntactically broken while the commit passes
- Same file staged differently across commits is the main failure mode
- Amend on a bad partial commit makes recovery harder

**If partial staging corrupts a file:**

1. Stop committing
2. Restore the file to **full final intended content** (backup ref, stash, or rewrite from known-good)
3. Run typecheck / `tsc --noEmit`
4. Continue — prefer whole-file staging for that file going forward

**Never amend** a botched split commit unless the user's git rules allow it (unpushed, created this session, user requested amend).

## 6. Common slice patterns

### New feature with wiring

1. Core implementation (new directory/files)
2. Integration (module providers, exports, options) — often mixed files
3. Tests
4. Docs

### Parity port (e.g. PHP → TypeScript)

1. Small fixes (headers, naming, uuid version)
2. Self-contained features (encoding, batch API, events)
3. Exception/handler changes
4. Command helpers / library API surface
5. Tests covering parity
6. README status update

### Config + code in same file

`package.json` exports, `tsdown.config.ts` entry points — stage only the export/entry hunks for the commit that introduces that module.

## 7. Final verification

```bash
git status --short          # must be empty
git log --oneline -<N>      # show the new sequence
```

Run project checks: typecheck, lint, test, build. All must pass on the final tree.

Report back:

- Commit list (hash + subject)
- Backup ref location
- Check results
- Any corruption/repair that happened during the split

## 8. Failure recovery

| Problem | Action |
|---------|--------|
| Wrong hunks in a commit | `git show HEAD` to confirm; revert/fixup only with user approval |
| Worktree file corrupted | Restore full final file; re-run typecheck |
| Pre-commit hook modified files | Re-read `git diff`; verify commit captured intended content |
| `index.lock` | Wait/retry; never force past a running hook |
| Too tangled to split safely | Stop; offer fewer larger commits or **split-to-prs** |

## Worked example

**Input:** message-bus library — uuid fix, delay queues, DTO header, encoding, batch consumer, commands, tests, README (~30 files).

**Plan (12 commits):**

```text
 1. fix(producer): use uuid v6
 2. fix(producer): match delay queue names
 3. fix(exceptions): use requeue-count header
 4. feat(dto): add configurable class header
 5. feat(events): add lifecycle pre-hooks
 6. feat(encoding): add compression codecs
 7. feat(exceptions): publish validation failures
 8. feat(consumer): add batch processing
 9. feat(commands): add message bus helpers
10. style(producer): sort option imports
11. test: cover message bus parity changes
12. docs: update message bus parity docs
```

**Mixed files (Phase A):** `amqp.producer.ts`, `messaging.consumer.ts`, `message-bus.module.ts` — partial stage per commit; typecheck worktree after commits 4, 6, 8.

**Endgame (Phase B):** commands dir + exports whole-file; style/test/docs as separate whole-file commits.

Full postmortem with failure modes: [references/message-bus-case-study.md](references/message-bus-case-study.md)

## Boundaries

- Does not push, open PRs, or create branches (see **split-to-prs**).
- Does not invent commit messages when **caveman-commit** is available.
- Does not split commits across branches — that is **split-to-prs**.
- When the user only wants a commit message for already-staged work, use **caveman-commit** instead.
