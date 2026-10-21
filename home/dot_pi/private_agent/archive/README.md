# Archived extensions

Historical Pi extensions written for personal use and learning. **None of these
are loaded** — Pi only auto-loads extensions from `~/.pi/agent/extensions/`,
and this directory is deliberately outside it. Kept for design reference and
as a record of what was learned building them.

## Status: retired 2026-09-04

The subagent system migrated to community-maintained extensions:

- **[pi-subagents](https://github.com/nicobailon/pi-subagents)** — replaces
  `herdr-agents`' subagent delegation (background children, fleet view,
  detached result delivery, clarification flows, `/council`, Herdr metadata +
  on-demand inspector panes).
- **[pi-intercom](https://github.com/nicobailon/pi-intercom)** — replaces the
  planned "herdr-peers" concept (named long-lived sessions, 1:1 messaging,
  `contact_supervisor` bridge for subagent children).

`herdr-agents` was retired after the `herdr-agent-oneshot-only` refactor
(supagents are one-shot job-doers; continuation via session-file resume). That
design converged with the community's; see the OpenSpec archive
(`openspec/changes/archive/2026-09-04-herdr-agent-oneshot-only`) and specs
(`openspec/specs/herdr-agent-delegation/`) for the full design record.

## Status: retired 2026-09-06

`herdr-tab-name.ts` (tab name sync) also retired: with pi-subagents handling
children, dynamic session-name → tab-label sync is no longer wanted — tabs stay
statically named "pi". Also, its `HERDR_AGENT_CHILD` guard was dead code
(pi-subagents marks children with `PI_SUBAGENT_CHILD` instead), so background
children inheriting `HERDR_PANE_ID` could rename the parent tab. If dynamic
naming is ever wanted again, the correct minimal version is: gate on
`ctx.mode === "tui"`, skip when `PI_SUBAGENT_CHILD=1`, and rename directly via
`herdr tab rename "$HERDR_TAB_ID" <name>` (no snapshot dance).

## Status: retired 2026-10-21

`oxc-auto/` (auto `oxlint`/`eslint --fix` + `oxfmt`/`prettier` after every
`edit`/`write` on a `.ts` file) retired: it spawned bare `oxlint`, `eslint`,
`prettier` from `PATH` instead of the project's `node_modules/.bin`, so in the
common prettier + eslint repo the lint step was a silent no-op and formatting
fell back to global `oxfmt` with default options (2-space indent), ignoring
`.prettierrc` and producing churn the repo's own `npm run format` reverts. It
also rewrote files mid-turn, invalidating the model's `oldText` anchors.

A stop-hook (one pass over changed files at the end of a turn, project-local
binaries, report-only) is the cheaper design if the idea returns.

## Contents

| Directory | What it was | Notes |
|---|---|---|
| `oxc-auto/` | Post-edit hook: lint `--fix`, then format, then feed findings back into the tool result | Retired 2026-10-21: wrong binary resolution, format churn, stale `oldText` mid-turn. See above |
| `herdr-agents/` | `herdr_agent` tool: one-shot delegation through Herdr panes/tabs, detached delivery via widget poller, parked questions, session resume, `/run`, `/council`, `/herdr-agents` manager | Superseded by pi-subagents. Home copy and configs (`herdr-agents.json`, `council.json`, state file) removed from `~/.pi/agent/` |
| `herdr-peers/` | Planning stub only (PLAN.md + proposal.md, no code): user-driven long-lived peer sessions in Herdr tabs | Superseded by pi-intercom + pi-subagents project panes |
| `herdr-tab-name.ts` | Renamed the Herdr tab to the Pi session name (synced pi-autoname via `session_info_changed`) | Retired 2026-09-06: static "pi" tab name preferred; guard was dead code, background children could hijack the rename |
| `zz-composer-herdr-agent.ts` | Single-file shim that renamed `herdr_agent` → `pi__herdr_agent` in the system prompt for Cursor Composer models | Only existed to serve `herdr-agents`; retired with it (see its `docs/composer-cursor-sdk-compatibility.md`) |

Live single-file extensions that remain in `extensions/` (not archived):
`herdr-agent-state.ts` (managed by Herdr itself) —
integrates the Pi session with Herdr state reporting and is still in use.

## How to restore one

```bash
# 1. Move it back into the managed extensions surface
mv home/dot_pi/agent/archive/<name> home/dot_pi/agent/extensions/<name>
# 2. Apply the restored extension
chezmoi apply ~/.pi/agent/extensions/<name>
# 3. Restart Pi or run /reload
```

Read its `AGENTS.md` first — it documents the intended model behavior and the
test suite (`bun run test:all` inside the extension directory).
