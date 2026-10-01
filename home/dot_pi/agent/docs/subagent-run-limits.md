# Subagent Run Limits

Operational notes for long-running Pi subagents (worker, reviewer, scout) used in this repo. Not a design decision — a troubleshooting reference for when a delegated run stalls or dies.

## Run deadline

Each single-agent run has a wall-clock deadline. The default is 30 minutes; on expiry the runner aborts the child and the run comes back as failed with `Subagent timed out after <n>ms.` — the work in flight is lost, so the orchestrator always sees the failure.

Resolution order for the effective deadline:

1. `timeoutMs` / `maxRuntimeMs` on the subagent launch call
2. `defaultTimeoutMs` on the agent definition (frontmatter `timeoutMs:`)
3. `timeoutMs` in `~/.pi/agent/extensions/subagent/config.json` (managed by the `dotfiles` repo)
4. built-in 30 minutes

The current value is 5 hours, set globally in the dotfiles repo. The hard ceiling is 2147483647 ms (~24.8 days); a larger value overflows the runner's timer and kills the run immediately.

Composite (scripted) workflows are unbounded at the top level, but every child inside them still resolves its own deadline.

`checkpointBeforeDeadlineMs` (currently 2 minutes, same config file, off by default) makes the runner steer the child shortly before the deadline so it finishes its current tool call and replies with a handoff instead of being killed mid-work. It adds nothing to the parent agent's context — it is a runner-side steer into the child session.

## Diagnosing a stalled worker

A run that burns its whole deadline without making progress is usually not slow work — it is a call that never returns. Suspects, in order of likelihood:

- **A `bash` call with no `timeout` argument.** Pi's bash tool has no default timeout; `timeout` (seconds) is optional. Calls that never emit output never return: `tail -f`, `npm run dev`, a REPL, `docker compose up`, anything waiting on stdin.
- **A backgrounded process that inherited the terminal.** `npm test &` returns a prompt, but the open stdout pipe keeps the bash call alive. Redirect output and use `nohup` for long-running servers.
- **Unbounded waits.** `sleep 3600`, a `while true` poll loop, or a script blocking on a service that never came up.

Response: re-launch with an explicit per-call `timeout` so the stuck call fails in minutes and the child can continue, or split the work into smaller steps. Check `status.json` and the child transcript in the run's async directory to see which step was stuck.