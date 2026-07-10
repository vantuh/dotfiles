# Case study: message-bus parity split (12 commits)

Real run on `@fozzyua/message-bus` (`feat/initial`). ~30 files, mixed staging across producer/consumer/module wiring.

## Starting state

- Large dirty tree after PHP → NestJS parity work (fixes, features, tests, docs)
- Mixed files: `amqp.producer.ts`, `messaging.consumer.ts`, `message-bus.module.ts`, `message-bus.events.ts`, `amqp.producer.options.ts`, `validation.handler.ts`
- Untracked dirs: `src/encoding/`, `src/commands/`, batch consumer files

## Approved plan (12 commits)

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

## What worked

### Early commits: partial staging for mixed files

Feature/fix slices that touched shared wiring files used partial index staging so the worktree stayed at the final combined state while each commit only contained its slice.

### Late commits: whole-file staging

Once core features were committed, remaining slices were clean whole-file commits:

| Commit | Staged as |
|--------|-----------|
| commands | `src/commands/`, `package.json` export hunks, `tsdown.config.ts` entry, `src/index.ts` export |
| style | `src/producer/amqp.producer.options.ts` (import order only) |
| test | five `*.spec.ts` files |
| docs | `README.md` |

This avoided further partial-staging risk on already-touched files.

### Pre-commit hooks

Each commit ran `lint-staged` (eslint + prettier). Hooks passed on staged content; worktree integrity still needed manual checks after partial staging.

## What failed

### Partial staging corrupted worktree files

`message-bus.module.ts` and `amqp.producer.ts` ended up syntactically broken after partial index staging + hook stash/restore:

- `sendDto()` / `prepareMessage()` blocks interleaved (missing braces, stray `);`)
- Module providers block mangled during incomplete batch commit amend

**Symptom:** `pnpm run type:check` failed on worktree even though committed/staged content passed hooks.

### Recovery

1. Stop committing; do not amend unless user's git rules allow it
2. Rewrite affected files to the **full final intended content** (not HEAD, not partial slice)
3. Run `pnpm run type:check` (or project equivalent)
4. Continue with remaining commits — prefer whole-file staging for files that were corrupted

### Other friction

- `.git/index.lock` during pre-commit on batch commit — wait and retry
- Failed amend on incomplete batch commit — fixed by restoring file, then amend only per user git rules

## Final verification

```bash
git status --short   # empty
pnpm run type:check
pnpm run lint
pnpm run test        # 97/97
pnpm run build
```

## Takeaways

1. **Plan mixed files upfront** — list which file goes in which commit before touching the index
2. **Partial staging is for the middle** — fixes/features in shared files; not for tests/docs/style at the end
3. **Typecheck the worktree after every partial commit** — staged correctness ≠ worktree correctness
4. **Keep final file content reachable** — backup ref + mental model of end state before starting
5. **Separate style** — import-order-only changes deserve their own `style` commit when they would pollute a feature diff
