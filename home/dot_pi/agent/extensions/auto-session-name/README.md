# auto-session-name

Session naming with the policy of Pi Web's "generate name" button: the whole
conversation under a character budget, the session model, strict title parsing,
and no fallback. A failed run leaves the session unnamed instead of naming it
after a fragment of the user's own message, which is what `pi-autoname` did
whenever its model call failed.

## Behaviour

- **Automatic** — after a settled run, only while the session is unnamed.
  Existing names (`/name`, `--name`, another extension) are left alone, so a
  name you chose is never replaced by a worse one. A failed attempt is retried
  on the next settle.
- **`/autoname`** — regenerate from the current conversation. This is the only
  path that overwrites an existing name, and it keeps a name that landed while
  it was generating.
- **Model** — the session model, at the cheapest thinking level it supports,
  with 512 output tokens and no prompt cache (the request is too small to
  reuse or warm a prefix). 90 s timeout.

A rename made by another process (for example Pi Web) is invisible here: the
SDK reads session names from its own in-memory entries and never re-reads the
session file for them.

## Where the policy comes from

`lib.ts` and the request in `index.ts` mirror
`lib/session-title.ts` in [agegr/pi-web](https://github.com/agegr/pi-web):
per-message caps (800 user, 300 intermediate reply, 600 newest reply, 600
summary), a 6000-character transcript budget with 40% reserved for the opening
turns, tool calls and results dropped, and the same title-cleanup rules. Two
deliberate differences: we ask for 512 output tokens instead of 256, because a
reasoning model shares that budget with its thinking; and we do not forward
`transport`, `thinkingBudgets`, or `maxRetryDelayMs`, which the extension
registry API does not expose.

## Tests

```bash
bun test/auto-session-name.test.ts
```

Covers title cleanup in every supported label language, the 80-code-point cap,
rejection of unusable answers, which message roles reach the model, the
per-message caps, and the transcript budget with its head/tail elision.
