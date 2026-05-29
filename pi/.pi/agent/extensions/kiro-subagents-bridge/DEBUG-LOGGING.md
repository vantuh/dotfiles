# kiro-subagents-bridge Debug Logging

## Log file

```
/tmp/kiro-subagents-bridge-debug.log
```

Format: `[HH:MM:SS.mmm] message {json}` — written by `logging.ts:log()` via `appendFileSync`.

### Watch in real time

```sh
tail -f /tmp/kiro-subagents-bridge-debug.log
# filter by cwd
tail -f /tmp/kiro-subagents-bridge-debug.log | grep 'web-apps'
# clear and restart
> /tmp/kiro-subagents-bridge-debug.log && tail -f /tmp/kiro-subagents-bridge-debug.log
```

Console still prints a one-line summary on each sync; use the log file for full detail.

---

## All log messages

### index.ts — extension lifecycle

| Message | Data | When |
|---|---|---|
| `extension loaded` | `{ pid, logFile }` | Extension initialized |
| `session_start` | `{ cwd }` | Pi session started, sync begins |
| `sync complete` | `{ cwd, written, unchanged, removed, kiroRoot, agentNames }` | Sync finished with agents |
| `sync complete (empty)` | `{ cwd, globalDir, kiroRoot }` | No Kiro agents for this cwd |
| `sync failed` | `{ cwd, error }` | Uncaught sync error |
| `discover patch installed` | `{ agentsModulePath }` | `preload.ts` wrapped `discoverAgents` |
| `discover patch import failed` | `{ error }` | Could not load pi-subagents `agents.ts` |
| `discover patch assign failed` | `{ okDiscover, okDiscoverAll }` | ESM export replace failed |
| `synced kiro agents loaded for discovery` | `{ dir, count }` | Injected project agents for current kiro root |
### sync.ts — discovery and write

| Message | Data | When |
|---|---|---|
| `sync start` | `{ cwd, globalDir, projectDir, kiroRoot, outDir }` | Paths resolved |
| `agents discovered` | `{ globalCount, projectCount, mergedCount, globalNames, projectNames }` | JSON dirs read |
| `agent written` | `{ name, outPath, bytes, model }` | New or changed `.md` |
| `agent unchanged` | `{ name, outPath }` | Hash match, skipped write |
| `agent removed` | `{ file }` | Stale `.md` pruned from `kiro-active/` |
| `sync done` | `{ written, unchanged, removed, agentNames }` | Final counts |

### kiro-parse.ts — JSON loading

| Message | Data | When |
|---|---|---|
| `agents dir missing` | `{ dir }` | Directory does not exist |
| `agents dir unreadable` | `{ dir, error }` | `readdir` failed |
| `agent loaded` | `{ name, sourcePath }` | JSON parsed OK |
| `agent skipped` | `{ file, reason }` | Parse/read/validation failure |

### map-to-pi.ts — conversion warnings

| Message | Data | When |
|---|---|---|
| `prompt unresolved` | `{ name, prompt }` | `file://` prompt path not found |
| `prompt loaded` | `{ name, path, chars }` | Prompt file read |
| `resources skipped` | `{ name, resource, reason }` | `skill://` or empty glob |
| `mcpServers present` | `{ name, servers }` | Kiro MCP block not auto-wired |

---

## Common debugging scenarios

### No `kiro.*` agents in subagent list

1. `extension loaded` — confirm bridge is registered in `settings.json`
2. `session_start` — note `cwd`
3. `sync complete (empty)` — check `globalDir` and whether `kiroRoot` was found
4. `agents discovered` — `mergedCount` should be > 0
5. Confirm files exist under `~/.pi/agent/agents/kiro-active/`

### Agent missing after editing Kiro JSON

1. `agent written` vs `agent unchanged` for that name
2. `agent skipped` if JSON invalid
3. Start a new Pi session (`session_start` re-runs sync; no live file watcher)

### Prompt body empty

1. `prompt unresolved` — path in JSON does not resolve from repo
2. Compare with Kiro `install.sh` output under `~/.kiro/agents/`

### Project agent not overriding global

1. `agents discovered` — `projectNames` should include the name
2. `kiroRoot` must be set (repo has `.kiro/`, not `~/.kiro`)

### Subagent `Error: Internal error` with kiro-acp model

Typical for Kiro agents with `mcpServers` (e.g. `code-reviewer` + `foodtech-gitlab`):

1. Bridge logs `kiro-acp skipped` and `mcpServers present` for that agent
2. Regenerated `code-reviewer.md` should have **no** `model: kiro-acp/...` line
3. Check `/tmp/kiro-acp-debug.log` — `prompt error → error` with `Internal error` means kiro-cli failed, not the bridge
4. Full GitLab MR review still requires native `kiro-cli` or Pi MCP configured for GitLab — Pi subagents only get Pi-bridged builtins
