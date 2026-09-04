# Proposal: herdr-peer-extension

> **STATUS: SUPERSEDED — never implemented.**
> The need this change was scoped for (long-lived peer sessions, user-driven
> follow-up prompts, cross-session communication) is now covered by off-the-shelf
> extensions: **pi-subagents** (Herdr project panes, fleet inspector) and
> **pi-intercom** (named 1:1 sessions via a local broker, `send`/`ask`/`reply`,
> `contact_supervisor` bridge for subagent children). The owning setup migrated
> to those extensions; `herdr-agents` (and this planned `herdr-peers` sibling)
> are retired. Archived for design reference only — do not implement.
> Related: the `herdr-agent-oneshot-only` change removed the persistent
> lifecycle from `herdr_agent` before this migration.

## Why

`herdr-agent-oneshot-only` removes the persistent lifecycle from the subagent tool, establishing that subagents are ephemeral job-doers. But Herdr's tab model gives this setup a capability mainstream harnesses are only now adding: long-lived, user-addressable agent sessions (Claude Code's experimental "agent teams" calls them teammates — full independent sessions that receive new tasks over time and shut down only explicitly). That concept is a *peer*, not a subagent: it is driven by the user (or a future peer-to-peer protocol), not by an orchestrator's label-reuse contract. Putting it in the subagent tool is what caused the lifecycle confusion; keeping the capability requires giving it its own surface, its own instructions, and its own ownership model.

## What Changes

- New extension `herdr-peers` (sibling of `herdr-agents` under `pi/.pi/agent/extensions/`) providing user-facing long-lived peer sessions in Herdr tabs.
- A `/peer` command set: create a named peer session from an agent profile, list peers with status, focus a peer, send a follow-up prompt to a peer, close a peer explicitly.
- Peer sessions persist across tasks until explicitly closed by the user; closing is a deliberate action, never an automatic side effect of task completion.
- Peer sessions are never exposed as a model-facing tool parameter of `herdr_agent`; the Orchestrator cannot create, reuse, or close peers (it may read their existence for context if trivially available, but that is not required for the skeleton).
- Peer prompts are free-form user turns (no `HERDR_RESULT` protocol requirement); peers answer conversationally and stay open.
- Non-goals for this change: model-facing peer tool, peer-to-peer messaging/mailbox, shared task lists, automatic resumption of closed peers (session files make this possible later without schema changes), and any dependency on the external Herdr Peer server proposal beyond what `herdr agent start/prompt/wait` already provides today.

## Capabilities

### New Capabilities

- `herdr-peer-sessions`: User-managed long-lived peer sessions in Herdr tabs — creation, listing, focusing, follow-up prompting, and explicit closing; strict separation from the `herdr_agent` subagent tool. *(Delta removed at archive time: never implemented; superseded by pi-subagents + pi-intercom.)*

### Modified Capabilities

- (none)

## Impact

- Would have added `pi/.pi/agent/extensions/herdr-peers/` — never implemented; the existing `herdr-peers` experiment directory predates this change and is retired alongside it.
- Depends on: `herdr-agent-oneshot-only` (conceptually — the one-shot-only subagent contract is the boundary this extension complements).
