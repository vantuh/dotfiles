# Tasks — herdr-agent-oneshot-only

## 1. Schema and instructions

- [x] 1.1 Remove `lifecycle` and `timeoutMs` from `buildHerdrAgentParams`; fold the fixed timeout into the wait call site; update remaining parameter descriptions to the one-shot-only contract (`agent`, `task`, `tabLabel`, `model`, `wait`, `resumeClosed`)
- [x] 1.2 Rewrite `GLOBAL_INSTRUCTIONS` in `constants.ts`: keep delegation policy, parallelism, self-contained tasks, re-wait and resume entry points; delete persistent/reuse/standby paragraphs and the "closed persistent cannot be resumed" rule
- [x] 1.3 Update `buildRunTurnInstructions` and the `/run` completion/usage text if they reference lifecycles
- [x] 1.4 Update `formatAgentQuestion` and mismatch/error texts: the "live persistent exists" error becomes the generic "live agent cannot receive a new task" error naming the alternatives (re-wait, answer in place, `resumeClosed` after close)

## 2. Tool behavior

- [x] 2.1 In `index.ts`, delete the `persistent` lifecycle branch: `lifecycle` parsing, `activeLifecycle`, persistent reuse selection, and the `resumeClosed`-rejects-persistent check
- [x] 2.2 Keep and re-verify the parked-question reuse path (label-addressed task delivered to a parked one-shot) — this is now the only live-reuse path
- [x] 2.3 Add the live-agent task rejection: exact-label task against a live, non-question agent fails with guidance (re-wait / answer / resume after close)
- [x] 2.4 Make `resumeClosed` the documented continuation path in schema description and soft-hint texts; behavior stays as implemented (owner-scoped, session-validated)
- [x] 2.5 Replace the fixed default timeout constant at the wait call site; ensure abort/timeout soft hints unchanged

## 3. UI surfaces

- [x] 3.1 Widget: remove "reusable" lifecycle rendering (`formatLifecycle`), render one-shot status only
- [x] 3.2 `/herdr-agents` manager: remove persistent close branch (plain close path for any settled agent); keep listing, focus, and close behavior for all managed agents
- [x] 3.3 Verify detached delivery closes one-shots on delivery unchanged (poller path)

## 4. Docs

- [x] 4.1 Rewrite `AGENTS.md`: purpose (one-shot delegation + resume), intended model behavior, delegation policy table without persistent column entries, "Important behavior" section pruned of persistent items
- [x] 4.2 Prune `docs/README.md` role matrix / negative policy mentions of persistent lifecycle

## 5. Tests

- [x] 5.1 Update contract tests: schema no longer has `lifecycle`/`timeoutMs`; details keys drop `lifecycle` where applicable; new pinned error texts
- [x] 5.2 Replace integration persistent-reuse scenarios with: live-agent task rejection, resume-closed continuation with prior context, parked-question round trip still green
- [x] 5.3 E2E: replace the persistent-context scenario with a resume-closed scenario asserting the resumed child sees prior context from the archived session
- [x] 5.4 Run `bun run test:all` and the two smoke checks from `AGENTS.md` (bundle + fresh-Pi tool listing)
