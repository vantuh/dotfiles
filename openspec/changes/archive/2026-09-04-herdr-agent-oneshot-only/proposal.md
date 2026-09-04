# Proposal: herdr-agent-oneshot-only

## Why

The `herdr_agent` tool currently carries two lifecycles (`oneshot` and `persistent`), which turns a single-purpose delegation tool into five implicit modes (spawn, re-wait, answer parked question, persistent reuse, resume closed). The persistent mode requires a model-facing reuse contract ("repeat `lifecycle: persistent` with the same `tabLabel` or a duplicate spawns"), standby-spawn rules, and label-based reuse machinery — all of which must be explained to the model on every turn. Industry harnesses (Claude Code subagents, Cursor subagents) treat subagents as ephemeral job-doers, and keep long-lived "teammate"-style agents as a separate mechanism with separate UX. Herdr tabs give this setup the *capability* of long-lived agents, but that capability belongs to a future peer/teammate extension, not to a lifecycle parameter on the subagent tool.

Context accumulation — the actual need behind `persistent` — is already served better and more durably by session-file resume (`resumeClosed`): a closed one-shot archives its child session and can be reopened with full context by exact label. Live-pane state is what generates most of the extension's complexity (reuse contracts, close rules, orphan warnings on layout switch); disk state does not.

## What Changes

- **BREAKING**: Remove the `persistent` lifecycle from the `herdr_agent` tool. The `lifecycle` parameter is removed from the schema entirely; every spawned agent is a one-shot that closes after a successful result.
- **BREAKING**: Remove label-based persistent reuse. A `task` addressed to a live agent by its exact label is now rejected unless it is answering a parked question (that path stays). Reuse-with-context moves to `resumeClosed`.
- Promote `resumeClosed` from edge feature to the primary continuation path: continue a previous one-shot with its accumulated context by passing the same `tabLabel` and a new `task`.
- Remove `timeoutMs` from the model-facing schema; the wait timeout becomes a code constant (current default 600000 ms kept). Re-wait after timeout/abort is unchanged.
- Remove the `model` parameter's persistent-related caveat wording (fresh-spawn-only override semantics stay; `/council` keeps working unchanged).
- Rewrite injected Orchestrator instructions (`GLOBAL_INSTRUCTIONS`): drop all persistent/reuse/standby paragraphs; keep delegation policy (when to delegate, parallelism, self-contained tasks, no duplication). Continuation mechanics move to the tool schema descriptions and just-in-time tool-result texts.
- Update `AGENTS.md`, the widget, `/herdr-agents` manager, and the `/run` instruction block to a one-shot-only world (no "reusable" lifecycle rendering, no standby guidance).
- Keep unchanged: one-shot spawn, detached delivery via widget poller (exactly-once), parked-question flow (`ask_question` round trip, one-shots included), re-wait by omitting `task`, soft re-wait hints, `/council`, `/run`, layouts, child protocol.
- Out of scope: any peer/teammate extension (tracked separately in `herdr-peer-extension`).

## Capabilities

### New Capabilities

- `herdr-agent-delegation`: The `herdr_agent` tool contract — one-shot spawning, detached result delivery, re-wait, parked-question answering, and session-file resume as the only continuation mechanism.

### Modified Capabilities

- `council-command`: The orchestration message no longer references `lifecycle` (it never did explicitly, but the contract must state researchers are one-shot agents that are closed after collection); wording-level delta only.

## Impact

- `pi/.pi/agent/extensions/herdr-agents/`: `schema.ts` (param removal), `constants.ts` (instruction rewrite), `index.ts` (remove persistent reuse branch, keep answeringQuestion and resume paths; remove "live persistent exists" mismatch error), `widget.ts` (lifecycle rendering), `run.ts` (`/run` instructions), `state.ts` (no behavioral change; closed-history becomes the primary continuation store).
- `pi/.pi/agent/extensions/herdr-agents/AGENTS.md`: purpose, intended model behavior, and delegation policy tables.
- Tests: contract and integration layers lose persistent-reuse scenarios, gain one-shot-continuation scenarios; e2e persistent-context scenario replaced by a resume-closed scenario.
- The global orchestrator prompt (`agents/` delegation docs) references persistent agents — updated in this change since the instruction text lives in `constants.ts`; the standalone `agents/.agents/AGENTS.md` delegation matrix is role-based and needs no change.
