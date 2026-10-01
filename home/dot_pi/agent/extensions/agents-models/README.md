# agents-models

`/agents-models` — a searchable popup for pinning a model to a pi-subagents
agent. Three steps in one overlay: **agent → model → settings file**.

- Step 1 lists every discovered agent with where its current model comes from
  (`project override`, `user override`, `agent frontmatter`,
  `subagents.defaultModel`, `parent session`).
- Step 2 searches the model registry with the session's scoped models
  (`/scoped-models`, i.e. `enabledModels`) pinned at the top, then every other
  available model. Models without configured auth are marked `no auth`. If the
  agent already has an override, a `clear override` entry sits at the bottom.
- Step 3 chooses `~/.pi/agent/settings.json` (all projects) or
  `<projectRoot>/.pi/settings.json` (this repository only).

Typing filters the current step, `↑`/`↓` move, `enter` selects, `esc` goes back
(a cancel on the first step). The write is atomic and preserves every other
setting, including the other fields of an existing override (for example
`scout.thinking` survives clearing only its model). The extension reloads Pi
afterwards so the change takes effect immediately.

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

Covers the picker's step machine (filter, back, cancel, confirm, clear), the
settings write, and writing through a symlinked target.
