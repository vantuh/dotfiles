## Why

When a non-trivial question comes up, one model's answer can be one-sided. Asking the same question to several models in parallel and consolidating gives a broader, cross-checked answer. All the machinery for this already exists in the `herdr-agents` extension (parallel `herdr_agent` spawns, waits, result delivery) — it just isn't exposed as a one-command ritual.

## What Changes

- Add a `/council <question>` slash command to the `herdr-agents` extension, following the `/run` pattern: it injects an orchestration user message and the Orchestrator model does the delegation via the existing `herdr_agent` tool.
- Add an optional `model` parameter to the `herdr_agent` tool schema that overrides the agent profile's model for that spawn (`buildPiArgs` already supports `--model`).
- Add a one-line JSON config `~/.pi/agent/council.json` (from the `pi` stow package) holding the model list, e.g. `{"models":["sol-5.6","opus-5","glm-5.3-flash"]}`.
- Flow: `/council <question>` → Orchestrator spawns one `researcher` agent per configured model in parallel (`wait: false`), collects all answers, then consolidates the final answer itself (no extra consolidator agent/pane).
- No new orchestration code in the extension: spawn/wait/layout/result machinery is reused as-is.

## Capabilities

### New Capabilities

- `council-command`: The `/council` command behavior — config-driven model list, parallel researcher spawns with model overrides, orchestrator-side consolidation.

### Modified Capabilities

## Impact

- `pi/.pi/agent/extensions/herdr-agents/schema.ts` — optional `model` param in tool schema (~15 lines).
- `pi/.pi/agent/extensions/herdr-agents/index.ts` — merge `model` override into spawn options; register `/council` command modeled on `/run` (~40 lines).
- `pi/.pi/agent/extensions/herdr-agents/config.ts` — read `council.json` (~10 lines).
- `pi/.pi/agent/council.json` — new one-line config file in the dotfiles `pi` stow package.
- Tests: extension unit/integration tests may need coverage for the `model` override and `/council` arg parsing.
