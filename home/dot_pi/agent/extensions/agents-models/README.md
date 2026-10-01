# agents-models

`/agents-models` — a searchable popup for pinning a model to a pi-subagents
agent. Two steps in one overlay: **agent → model**.

- Step 1 lists every discovered agent with where its current model comes from
  (`project override`, `user override`, `agent frontmatter`,
  `subagents.defaultModel`, `parent session`). Agents with `disabled: true` in
  `subagents.agentOverrides` are left out and counted in a dim note, mirroring
  what pi-subagents would launch. The six external-CLI agents
  (`claude-code`, `claude-code-writer`, `codex-exec`, `codex-exec-writer`,
  `cursor-agent`, `cursor-agent-writer`) are disabled that way; the
  self-pinned `council-*` advisors stay selectable.
- Step 2 searches the model registry with the session's scoped models
  (`/scoped-models`, i.e. `enabledModels`) pinned at the top, then every other
  available model. Models without configured auth are marked `no auth`. If the
  agent already has an override in the current target, a `clear override` entry
  sits at the bottom.

The write target is a header line, not a step: `tab` cycles `global`
(`~/.pi/agent/settings.json`) ↔ `local` (`<projectRoot>/.pi/settings.json`), and
the `local: no project settings for this project` note appears mid-modal when
the project has no local settings file.

Typing filters the current step, `↑`/`↓` move, `enter` selects, `esc` goes back
(a close on the first step), `tab` switches the write target. Saving a model
does not close the modal: it reports the pin (`saved worker → <model>`) and
returns to the agent list, so several agents can be pinned in one pass and each
row shows its updated model. Pi reloads once, when the modal closes and
something changed. The write is atomic and preserves every other setting,
including the other fields of an existing override (for example
`scout.thinking` survives clearing only its model).

## Agent discovery

pi-subagents does not export its agent discovery, so this extension
reconstructs the roster from the same locations it scans: the installed
`pi-subagents` package's `agents/` directory, `~/.pi/agent/agents`, `~/.agents`,
`$PI_SUBAGENT_EXTRA_AGENT_DIRS`, and the nearest project's `.agents` and
`.pi/agents`. Agents that only exist as a `subagents.agentOverrides` key are
included too. Use `/subagents-models` when you need pi-subagents' own view of
the live mapping.

## chezmoi

`~/.pi/agent/settings.json` is a dest-symlink into
`dotfiles/home/dot_pi/agent/.settings.json`, so a write from this popup edits the
tracked source directly — no `chezmoi add` needed. The write resolves the
symlink before its atomic rename, because renaming onto the link path would
replace the link with a regular file. Pi's own settings writer rewrites the file
in place, so the popup and `/settings` agree on the same file.

## Tests

```bash
bun test/agents-models.test.ts
```

Covers the picker's step machine (filter, back, close, confirm, clear, tab
target switching), the save-then-return-to-agents cycle including a failed
write, the disabled-agent filter, the settings write, and writing through a
symlinked target.
