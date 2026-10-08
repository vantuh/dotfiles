# ponytail

A persistent ponytail level for Pi, controlled by one command.

## Behaviour

- **Default `full`** for a fresh session. Levels are `lite`, `full`, and `ultra`, plus `off`.
- **`/ponytail lite|full|ultra`** sets the level and is idempotent. **`/ponytail off`** turns it off. **`/ponytail status`** reports the level and changes nothing. A bare **`/ponytail`** turns it on at `full` when it is off, and reports the level when it is already on. Any other argument is rejected without changing state.
- **Footer** shows `🐴 ponytail: FULL` (or `LITE`, `ULTRA`, `OFF`) under its own `setStatus` key, so it never replaces the footer.
- **Persistence** uses a `ponytail-mode` session entry. `session_start` and `session_tree` restore the active branch's value, so a saved level survives reload, resume, fork, and history-tree switches instead of resetting to `full`.
- **Prompt** gets one structured section, `sections.ponytail`. An active level carries the installed `SKILL.md` plus a line naming that level. Off keeps the section and uses it to neutralize the ponytail instructions still present earlier in the conversation. Only the `ponytail` section is touched.
- **Control is slash-only.** Chat phrases such as "stop ponytail" or "normal mode" do not change the level.

`before_agent_start` runs once per submitted prompt, not for every tool-continuation model request. A command issued while a run is streaming changes the configured level immediately (the footer shows the selected level) but applies to the next agent run; the extension tells you so when this happens.

## Where the rules come from

The rule text is read eagerly when the extension loads, from `<agent-dir>/skills/ponytail/SKILL.md`, with `<extension-dir>/../../skills/ponytail/SKILL.md` as a fallback, and its YAML frontmatter is dropped with Pi's `stripFrontmatter`. `<agent-dir>` is whatever `PI_CODING_AGENT_DIR` points at, so the work profile shares the same skill through its symlinked skills directory. No rules are copied into this extension; only the level wrapper lives in `index.ts`.

A missing or empty skill fails the extension load with an error naming the candidate paths. Any other read error is wrapped with the file path and propagated.

The worker subagent extension `subagent-extensions/ponytail-full.ts` reads the same file and injects the `full` section. It has no command of its own.

## Tests

```bash
bun test/ponytail.test.ts
```

Drives the real registered handlers through a stub API: skill loading and its failure modes, the fresh-session `full` default, the command surface, a command issued while busy, persisted-level restoration, active-branch history switching, level and off sections, frontmatter removal, retention of another section, and a no-UI context.
