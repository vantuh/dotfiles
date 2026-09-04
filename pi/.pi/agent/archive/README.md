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

## Contents

| Directory | What it was | Notes |
|---|---|---|
| `herdr-agents/` | `herdr_agent` tool: one-shot delegation through Herdr panes/tabs, detached delivery via widget poller, parked questions, session resume, `/run`, `/council`, `/herdr-agents` manager | Superseded by pi-subagents. Home copy and configs (`herdr-agents.json`, `council.json`, state file) removed from `~/.pi/agent/` |
| `herdr-peers/` | Planning stub only (PLAN.md + proposal.md, no code): user-driven long-lived peer sessions in Herdr tabs | Superseded by pi-intercom + pi-subagents project panes |
| `zz-composer-herdr-agent.ts` | Single-file shim that renamed `herdr_agent` → `pi__herdr_agent` in the system prompt for Cursor Composer models | Only existed to serve `herdr-agents`; retired with it (see its `docs/composer-cursor-sdk-compatibility.md`) |

Live single-file extensions that remain in `extensions/` (not archived):
`herdr-tab-name.ts`, `herdr-agent-state.ts` —
these integrate the Pi session with Herdr itself and are still in use.

## How to restore one

```bash
# 1. Move it back into the extensions surface (repo side)
mv pi/.pi/agent/archive/<name> pi/.pi/agent/extensions/<name>
# 2. Re-create the home-side link (or re-run the dotfiles install.sh stow step)
ln -s ../../dotfiles/pi/.pi/agent/extensions/<name> ~/.pi/agent/extensions/<name>
# 3. Restart Pi / run /reload
```

Read its `AGENTS.md` first — it documents the intended model behavior and the
test suite (`bun run test:all` inside the extension directory).
