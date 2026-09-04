# Patched npm packages

Local patches on top of npm-installed pi packages. **Re-applying is required
after every `pi update` of the patched package** (updates wipe node_modules).

## pi-cursor-sdk-drain-timeout.patch → `npm:pi-cursor-sdk@0.3.6`

**Problem:** steering a busy cursor-model child aborts the in-flight run, but
the cursor agent never reports done/cancelled afterwards. The next turn's
`drainExistingCursorLiveRunBeforeSend` loops forever on
`while (!isReady(run)) waitForProgress(...)` — the child hangs silently as a
zombie "running" state with no events, no errors, and no cursor processes.

**Patch:** in `src|dist/cursor-provider-live-run-drain.js`, race the drain
`waitForProgress` against a 30 s timeout; on timeout, dispose the dead run and
let the new turn proceed. Patched in both `src/` (readable) and `dist/`
(loaded at runtime).

**Re-apply after updating pi-cursor-sdk:**

```bash
cd ~/.pi/agent/npm/node_modules/pi-cursor-sdk
patch -p1 -R --dry-run < ~/dotfiles/pi/.pi/agent/patches/pi-cursor-sdk-drain-timeout.patch 2>/dev/null \
  || patch -p1 --dry-run < ~/dotfiles/pi/.pi/agent/patches/pi-cursor-sdk-drain-timeout.patch \
  && patch -p1 < ~/dotfiles/pi/.pi/agent/patches/pi-cursor-sdk-drain-timeout.patch
```

(If the upstream code drifts, re-generate the patch against the new source —
the change is a bounded-window race around the drain `waitForProgress` loop.)

Reported upstream: fitchmultz/pi-cursor-sdk (steer/abort leaves the live run
in limbo; drain waits forever).
