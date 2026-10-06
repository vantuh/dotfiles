# caveman

A persistent caveman voice for Pi, controlled by one command.

## Behaviour

- **Default ON** for a fresh session. Exactly on or off, no levels.
- **`/caveman`** toggles. **`/caveman on`** and **`/caveman off`** set the mode
  and are idempotent. **`/caveman status`** reports the mode and changes
  nothing. Any other argument is rejected without changing state.
- **Footer** shows `🗿 caveman: ON` or `🗿 caveman: OFF` under its own `setStatus`
  key, so it never replaces the footer.
- **Persistence** uses a `caveman-mode` session entry. `session_start` and
  `session_tree` restore the active branch's value, so a saved OFF survives
  reload, resume, fork, and history-tree switches instead of resetting to the
  ON default.
- **Prompt** gets one structured section, `sections.caveman`. ON carries the
  installed `SKILL.md` rules. OFF keeps the section and uses it to neutralize
  the caveman instructions still present earlier in the conversation. The
  wrapper marks the extension-selected mode as authoritative, and only the
  `caveman` section is touched — `ponytail` and other sections are left alone.
- **Control is slash-only.** The mode is set by `/caveman` and made
  authoritative in the prompt. Chat phrases such as "stop caveman" or "normal
  mode" are ignored, the skill's `ultra`/`wenyan` aliases and status rule do
  not apply, and there is no natural-language parser.

`before_agent_start` runs once per submitted prompt, not for every
tool-continuation model request. A command issued while a run is streaming
changes the configured mode immediately (the footer shows the selected mode)
but applies to the next agent run; the extension tells you so when this happens.

## Where the rules come from

The rule text is read eagerly when the extension loads, from
`<agent-dir>/skills/caveman/SKILL.md`, with
`<extension-dir>/../../skills/caveman/SKILL.md` as a fallback, and its YAML
frontmatter is dropped with Pi's `stripFrontmatter`. `<agent-dir>` is whatever
`PI_CODING_AGENT_DIR` points at, so the work profile shares the same skill
through its symlinked skills directory. No rules are copied into this
extension; only the ON/OFF wrapper lives in `index.ts`.

A missing or empty skill fails the extension load with an error naming the
candidate paths, so ON is never advertised without its rules. Any other read
error is wrapped with the file path and propagated.

## Tests

```bash
bun test/caveman.test.ts
```

Drives the real registered handlers through a stub API: skill loading and its
failure modes, the fresh-session ON default, the command surface, a command
issued while busy, persisted-OFF restoration, active-branch history switching,
ON/OFF sections, frontmatter removal, retention of the ponytail section, and a
no-UI context.
