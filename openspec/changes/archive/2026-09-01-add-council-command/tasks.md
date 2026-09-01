## 1. Model override

- [x] 1.1 Add optional `model` parameter to `buildHerdrAgentParams` in `schema.ts` with a description stating it overrides the profile's model for that spawn; verify with existing schema tests that the param list still validates
- [x] 1.2 Merge the tool's `model` param over the profile model in the spawn path (`index.ts`, where `buildPiArgs` options are assembled) and add a unit/integration test asserting the spawned `pi` args contain `--model <override>`; add a test asserting absence of the param keeps profile model

## 2. Council config

- [x] 2.1 Add config loading for `~/.pi/agent/council.json` (`config.ts`): read `{"models": [...]}` at command time; return empty list on missing/unreadable file; unit-test missing, empty, and valid cases
- [x] 2.2 Create one-line `pi/.pi/agent/council.json` in the dotfiles repo with the initial model list and link it via stow (`./agents/link.sh --dry-run` style check or `stow -R pi --dry-run`); verify `$HOME/.pi/agent/council.json` resolves

## 3. /council command

- [x] 3.1 Register `/council` command in `index.ts` following the `/run` pattern: parse question, refuse when `!ctx.isIdle()`, read config, inject `[via /council]` message with the question and per-model spawn contract (parallel, `wait: false`, distinct labels, `model` override); show usage help on empty question; unit-test arg parsing and busy-guard
- [x] 3.2 Add the council instruction text to `constants.ts` next to `buildRunTurnInstructions` (self-contained message wording: one researcher per model, single-turn, consolidation expected); review that wording matches the spec's spawn contract

## 4. Verification

- [x] 4.1 Run `bun run test` in the extension and ensure all unit + integration tests pass (also fixed pre-existing test-infra issues: broken link-deps.sh paths in package.json scripts, cross-file Bun node:test interference, macOS 104-char socket-path EINVAL in nested harnesses, and the waitFor race in the detached-archive test)
- [x] 4.2 Manual e2e: start Pi in Herdr, run `/council <test question>` with a 2-model config, observe 2 parallel researcher panes with different models and one consolidated answer; then confirm no behavior change for `/run` and plain `herdr_agent` usage
