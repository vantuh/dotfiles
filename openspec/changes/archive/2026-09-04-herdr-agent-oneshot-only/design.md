# Design — herdr-agent-oneshot-only

## Context

The extension today supports two lifecycles in one tool. The `persistent` path adds: label-based reuse with the "repeat `lifecycle: persistent`" contract, the live-persistent mismatch error, the standby-spawn rule in `GLOBAL_INSTRUCTIONS`, "reusable" rendering in the widget/manager, and the persistent branch of `resumeClosedLiveDecision` rejection logic. The one-shot path already owns everything this change keeps: spawn, detached delivery, parked questions, re-wait, and closed-history archive + `resumeClosed` (currently restricted to one-shots — which after this change is the only case).

`/council` depends only on fresh spawns with `model` overrides and detached delivery — none of it touches lifecycle.

## Goals

- One continuation mechanism (resume), one lifecycle (one-shot), no implicit mode that spawns a duplicate agent.
- Instruction consolidation: mechanics live in schema descriptions + tool results; policy lives in `GLOBAL_INSTRUCTIONS`.
- Zero change to delivery semantics (exactly-once detached delivery, soft re-wait hints).

## Non-Goals

- No peer/teammate extension (separate change `herdr-peer-extension`).
- No change to layouts, config, state-file format (closed-history records keep their shape), child protocol, or `ask_question`.
- No rename of `resumeClosed` (accurate as-is; a rename can ride on a later breaking change if ever needed).

## Decisions

1. **Delete, don't deprecate.** The `lifecycle` parameter is removed outright rather than kept as a no-op. Rationale: a silently accepted parameter teaches the model the old contract and keeps the instruction text alive. Migration is trivial (remove the field from calls); the error surface (schema validation) is self-explanatory.
   - Alternative considered: keep `lifecycle: "persistent"` as accepted-but-ignored. Rejected — it preserves the exact ambiguity this change removes.

2. **Rejection semantics for label-addressed tasks.** A task addressed to a live agent by exact label fails with guidance, except when answering a parked question. Rationale: today the persistent-mismatch error exists because silently spawning a duplicate is the worst outcome; with no persistent lifecycle the remaining live-reuse path is the parked-question answer, which must keep working (one-shots included — `/council` consolidation and the question round trip rely on it). The failure text replaces the old persistent instructions and becomes the just-in-time teacher.
   - Alternative considered: fall back to spawning a duplicate with a suffix label. Rejected — duplicates were the original failure mode.

3. **`resumeClosed` becomes primary but stays explicit.** No auto-resume ("if a closed agent with this label exists, resume silently"). Rationale: resume replays the full child session — token cost the caller must opt into; explicit `resumeClosed: true` keeps spawn-fresh the default and resume the deliberate choice, matching the documented "include a summary in a new task instead" alternative for cheap cases.

4. **`timeoutMs` leaves the schema, becomes a constant.** The re-wait path makes a model-tunable timeout unnecessary; the existing soft-interrupt hint covers overrun. Tests that inject custom timeouts keep doing so via the harness, not the schema.

5. **State file unchanged.** Closed-history records, claim generations, and ownership stay exactly as they are; resume is already owner-scoped and validated. No migration needed — persistent agents never wrote closed-history records (they were never closed by the extension).

6. **Instruction rewrite direction.** `GLOBAL_INSTRUCTIONS` keeps: orchestrator role, profile picking, parallelism/independence limits, self-contained tasks, no duplication/recursion, one line each for re-wait (omit `task`) and resume (`resumeClosed: true` + same `tabLabel`). Dropped: the persistent paragraph, the standby paragraph ("user asks to open an agent without a task" — with no persistent lifecycle the tool has no standby mode; such a request surfaces the schema/scope in conversation), and the "closed persistent cannot be resumed" rule (obsolete).

## Risks / Trade-offs

- [Loss of the live "send the next task to the same pane" workflow] → Resume restores the same outcome with full context at respawn cost (seconds); users who relied on it get the guidance in the mismatch error. The capability returns properly in the peer extension.
- [Model habit: existing sessions may still emit `lifecycle`] → Schema validation error is immediate and self-describing; no partial-compat path to maintain.
- [Resume becomes the hot path and its edge cases matter more] → Closed-history machinery already has contract + e2e coverage; tasks add one e2e scenario replacing the persistent-context one.
- [`/herdr-agents` manager simplification may hide "reusable" agents users expect to see] → The manager keeps listing every managed agent with status; only the mode column rendering changes.

## Migration Plan

Single extension reload after implementation (`/reload`); no on-disk migration. Live persistent agents at upgrade time keep running in their panes and remain visible/closable via `/herdr-agents`, but can no longer receive new tasks by label — closing them and resuming the underlying work fresh (or via closed-history once collected) is the documented path. Rollback: git revert; state file is forward-compatible.

## Open Questions

None.
