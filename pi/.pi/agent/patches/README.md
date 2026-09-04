# Patched npm packages

Local patches on top of npm-installed pi packages. **Re-apply after every
update/reinstall of the patched package** (`pi install`/`pi update` replaces
the files; updates of OTHER packages don't touch it).

## pi-cursor-sdk-drain-timeout.patch → `npm:pi-cursor-sdk` (0.3.6+, tested on 0.3.6)

**Problem:** steering a busy cursor-model child aborts the in-flight run, but
the cursor agent never reports done/cancelled afterwards. The next turn's
`drainExistingCursorLiveRunBeforeSend` loops forever on
`while (!isReady(run)) waitForProgress(...)` — the child hangs as a zombie
"running" state: no events, no errors, no cursor processes.

**Patch:** in `drainExistingCursorLiveRunBeforeSend`, race the drain
`waitForProgress` against a 30 s no-progress window; on timeout, dispose the
dead run and let the new turn proceed. Covers both `src/` (readable) and
`dist/` (loaded at runtime).

## Workflow after updating pi-cursor-sdk

```bash
cd ~/.pi/agent/npm/node_modules/pi-cursor-sdk

# 1. Чи патч ще на місці? (1 = так, 0 = зник/оновлення зітерло)
grep -c "Promise.race" dist/cursor-provider-live-run-drain.js

# 2. Чи не пофіксли апстрім? (якщо так — патч не потрібен)
grep -n "timeout" dist/cursor-provider-live-run-drain.js

# 3. Сухий прогін, потім застосувати:
patch -p1 --dry-run < ~/dotfiles/pi/.pi/agent/patches/pi-cursor-sdk-drain-timeout.patch
patch -p1 < ~/dotfiles/pi/.pi/agent/patches/pi-cursor-sdk-drain-timeout.patch

# 4. Перевірка (має бути 1):
grep -c "Promise.race" dist/cursor-provider-live-run-drain.js
```

Якщо `--dry-run` падає (апстрім переписав той код) — не форсити: зміна за
змістом — обгорнути drain-цикл `while (!isReady(run)) waitForProgress(...)`
у race з 30s таймаутом і диспозити run на таймауті. Або чекати апстрім-фікс
(fitchmultz/pi-cursor-sdk — steer/abort лишає live run у лімбо, drain чекає
вічно).

## Симптом зникнення патчу

Worker на cursor-моделі після steer/abort: стан "running" без подій, без
помилок, без cursor-процесів (зомбі до timeout). Логи: events.jsonl обривається
на `subagent.steer.delivered`, stderr порожній.
