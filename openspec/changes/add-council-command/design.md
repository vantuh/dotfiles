## Context

The `herdr-agents` extension already provides everything needed for multi-agent delegation: `herdr_agent` tool, `herdr agent start/prompt/wait/read` wrappers, pane split layout with placement locking, result artifacts, and detached result delivery. Child Pi processes are launched with `--model` taken from the agent profile's frontmatter (`buildPiArgs` in `index.ts`). The `/run` command shows the established injection pattern: parse args, store a pending request, inject a `[via /run → agent] task` user message, and let the Orchestrator model do the actual tool calls. See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**

- One-command ritual: `/council <question>` asks the question to N models in parallel and produces one consolidated answer.
- Reuse existing extension machinery — no new orchestration, wait, or layout code.
- Model list lives in a one-line JSON config, editable without touching code.
- Same profile (`researcher`) for all answerers; only the model differs.

**Non-Goals:**

- No per-invocation model override in the command arguments (JSON is the single source of the model list).
- No dedicated consolidator agent or pane — the Orchestrator consolidates.
- No new orchestration layer in the extension (extension never chains spawns itself).
- No changes to pane layout logic; existing multi-agent split behavior applies.

## Decisions

### 1. Orchestrator-driven flow (injected message, not extension pipeline)

`/council` parses the question, reads the config, and injects a user message like `[via /council] <question>` with instructions to spawn one `researcher` per configured model in parallel and consolidate. The Orchestrator model executes via `herdr_agent`.

- *Why not extension-orchestrated (extension spawns/waits/consolidates directly)?* Deterministic, but requires a new orchestration pipeline in the extension (parallel waits, chaining a second phase, delivering the final text). The existing delegation machinery + global instructions already cover this; the model-driven path costs zero new orchestration code and stays consistent with `/run`.
- *Trade-off:* slightly non-deterministic and spends Orchestrator tokens; accepted for simplicity.

### 2. Optional `model` parameter on `herdr_agent`

`schema.ts` gains an optional `model: Type.Optional(Type.String(...))` — "Overrides the agent profile's model for this spawn." `index.ts` merges it over `options.agent.model` before `buildPiArgs`. `buildPiArgs` already emits `--model`; no change there.

- *Alternative considered:* N per-model profile variants (`researcher-opus.md`, …). Rejected: config explosion, and the user wants models in JSON, not profile files.

### 3. Config: one-line JSON in the `pi` stow package

`pi/.pi/agent/council.json`:

```json
{"models":["sol-5.6","opus-5","glm-5.3-flash"]}
```

Read at command time (not startup) by `config.ts`; missing file or empty `models` → warning "No council models configured in ~/.pi/agent/council.json" and no injection. Symlinked to `$HOME` like the rest of the package.

- *Why file not settings key:* keeps it a deliberate, self-contained knob; one line as requested.

### 4. Parallel spawns with `wait: false`

The injected instruction tells the Orchestrator to issue all `herdr_agent` calls in one turn with `wait: false` and matching `tabLabel`s (e.g. `Council — <model>`), then consolidate as results arrive via the existing detached-delivery poller.

- *Alternative:* three blocking `wait: true` calls. Rejected: sequential waiting serializes the round and delays the first answer.
- Lifecycle stays `oneshot` (default); answers are single-turn.

### 5. Orchestrator consolidates

All answers already arrive as tool results in the Orchestrator's context, so consolidation is free — the Orchestrator writes the final synthesized answer. Follow-up dialogue on the topic continues naturally in the main session.

- *Alternative considered:* 4th `herdr_agent` call as consolidator. Rejected: duplicates all answer text into another child's context for no benefit at typical answer sizes.

## Risks / Trade-offs

- [Model-driven flow is non-deterministic; Orchestrator might spawn sequentially or skip a model] → The injected message enumerates the exact models and states the contract (parallel, `wait: false`, one researcher per model). GLOBAL_INSTRUCTIONS already bias toward parallel independent calls.
- [Answers fan-in bloats the main session context] → Accepted for typical Q&A sizes; researcher output format is already brief-oriented ("Summary / Findings").
- [`model` override on `herdr_agent` is a general capability beyond council] → Intended: it is what collapses the "raw sessions vs profiles" duality. Guarded only by the model choosing to use it; no extra validation of model IDs (Pi's `--model` errors visibly on bad IDs).
- [Researcher profile has a fixed `model:` frontmatter] → Override must win over profile value; worth an integration test asserting the spawned `pi` args carry the override.
- [User runs `/council` while Orchestrator is busy] → Same guard as `/run`: notify and refuse when `!ctx.isIdle()`.

## Migration Plan

Purely additive. Ship schema + command + config file; symlink `council.json` via stow (`stow pi` re-run or `install.sh`). Rollback = remove the command registration; no persisted state changes.

## Open Questions

- Exact wording of the injected council instruction (phase 2 of GLOBAL_INSTRUCTIONS vs self-contained message) — settle during implementation, keep it in `constants.ts` next to `buildRunTurnInstructions`.
