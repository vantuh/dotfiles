# agents-watch

Read-only live view of a running pi-subagents child.

`/agents-watch` lists active async runs owned by the current Pi session, and on Enter splits a Herdr pane that
tails the chosen run's `events.jsonl`. Nothing is written and the runner is never
signalled.

The picker always shows, including for a single run: opening a pane is a
deliberate action, not something the command does on its own.

```
/agents-watch                  # always pick from active runs
/agents-watch <runId>          # skip the picker
/agents-watch <runId> --no-focus
```

Run id accepts a full uuid, a unique prefix, or the first 8 characters.

## Files

| File | Role |
| --- | --- |
| `index.ts` | The `/agents-watch` command, the picker rows, and the Herdr split |
| `session-runs.ts` | Client for pi-subagents' in-process RPC, which scopes runs to this session |
| `panes.ts` | Herdr pane column: stacking, equal-height rebalancing, duplicate detection |
| `watch.ts` | The viewer. Standalone: `bun watch.ts <runId> [--tail] [--expanded] [--step N]` |
| `runs.ts` | Run-root discovery shared with the viewer |

### Why an RPC client

The picker must only list runs belonging to the calling Pi session.
`status.json` records the launching session as a file path, which a session
resume invalidates. pi-subagents' `status` reply carries `data.asyncSnapshot`,
built in-memory from `state.currentSessionId`, so it stays correct across resume.

The package documents that RPC but ships no client, hence `session-runs.ts`
speaking the event-bus protocol directly. Filtering by session id here would
silently show other sessions' agents, so a missing owner is reported as an error
rather than falling back to every run on disk.

`openProjectPane` from `pi-subagents/project-panes` is not used: it spawns Pi,
not an arbitrary command, so the pane split stays hand-rolled.

### Pane stacking

Watcher panes form one column to the right of Pi:

- first watcher: `split --direction right --ratio 0.6`
- every later one: `split --direction down --ratio 0.5` inside the largest
  existing watcher pane
- then every `down` split holding watchers on both sides is rebalanced by count,
  so heights stay even. `right` splits are left alone, keeping the Pi column's
  width.

Panes are tagged via `pane rename`:

```
agents-watch:<id8> · <agent> · <model> · <thinking>
agents-watch:0f708073 · worker · deepseek-v4.1-flash · high
```

Agent, model and thinking come from `status.json` `steps[0]`, with the provider
prefix and `:thinking` suffix stripped from the model string. The tag is read
back from `pane list` on every invocation, and the short id after the prefix is
the dedup key. Opening an already-open run is a no-op that reports the existing
pane. No state file: a pane closed by hand simply disappears from the set.

The rebalance uses `layout.export` and `layout.set_split_ratio` over the Herdr
socket, which the CLI does not expose for layout.

`watch.ts` can also be tailed by hand:

```bash
bun ~/.pi/agent/extensions/agents-watch/watch.ts --tail
```

## Keys

| Key | Action |
| --- | --- |
| `Ctrl+O` | Toggle full output; redraws from the start of the run |
| `q` / `Ctrl+C` | Quit, closing the Herdr pane the watcher runs in |

`q` closes its own pane when `HERDR_ENV=1`, since a watcher pane is disposable.
Pass `--keep-pane` to quit without touching the layout. Outside Herdr there is no
pane to close and the process just exits.

## What it renders

Turns are framed and costed (`duration · tools · out tokens · $`), so folds keep
the frame edge. Also surfaced: `↻ retry` for rate-limit backoff, `⚑ control`
for long-running notices, `⇢ steer` for the steering lifecycle, and step/run
lifecycle rules. A pinned status bar carries hotkeys, run state, idle time,
tokens and the live/following marker.

Assistant prose is not streamed: `message_update` is dropped upstream, so it
arrives in bursts at `message_end`. Silence means the child is generating.

## Requirements

Herdr 0.7.5+ on `PATH`. Without it the command reports the manual command
instead of failing.