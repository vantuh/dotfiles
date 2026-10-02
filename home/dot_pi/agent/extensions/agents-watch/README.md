# agents-watch

Read-only live view of a running pi-subagents child.

`/agents-watch` lists active async runs owned by the current Pi session, and on Enter splits a Herdr pane that
tails the chosen run's `events.jsonl`. Nothing is written and the runner is never
signalled.

```
/agents-watch                  # pick from active runs (skipped when only one)
/agents-watch <runId>          # skip the picker
/agents-watch <runId> --no-focus
```

Run id accepts a full uuid, a unique prefix, or the first 8 characters.

## Files

| File | Role |
| --- | --- |
| `index.ts` | The `/agents-watch` command and the Herdr split |
| `watch.ts` | The viewer. Standalone: `bun watch.ts <runId> [--tail] [--expanded] [--step N]` |
| `runs.ts` | Shared run-root discovery and `status.json` reads |

`watch.ts` can also be tailed by hand:

```bash
bun ~/.pi/agent/extensions/agents-watch/watch.ts --tail
```

## Keys

| Key | Action |
| --- | --- |
| `Ctrl+O` | Toggle full output; redraws from the start of the run |
| `q` / `Ctrl+C` | Quit |

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