# kiro-subagents-bridge

Loads company **Kiro CLI agents** (`*.json`) into **pi-subagents** without modifying git repos.

## Behavior

**No background watchers.** Sync once per `session_start`. Cleanup on `session_shutdown` (quit).

### Global agents

- Source: `~/.kiro/agents/*.json`
- Output: `~/.pi/agent/agents/kiro-active/global/*.md`
- pi-subagents **user** scope (every session)
- Package: `kiro` → runtime name `kiro.<agent-name>`

### Project agents (per repo)

- Source: `{kiroRoot}/.kiro/agents/*.json`
- Output: `~/.pi/agent/agents/kiro-active/<project-basename>/*.md`
- pi-subagents discovers them as user scope (inside `agents/` recursive scan)
- Package: `kiro-<project-basename>` → runtime name `kiro-<basename>.<agent-name>`
- **Cleaned up on session quit** so agents from one project don't linger in another

## Setup

Toggle in `~/.pi/agent/settings.json` (defaults to `true` if omitted):

```json
"kiroSubagentsBridge": {
  "enabled": false
}
```

When disabled, the extension registers no handlers and skips sync/cleanup entirely.

```json
"packages": [
  { "source": "extensions/kiro-subagents-bridge" },
  { "source": "npm:pi-subagents", ... }
]
```

```bash
cd ~/dotfiles && stow pi
```

## Verify

```bash
tail -f /tmp/kiro-subagents-bridge-debug.log
# expect: extension loaded, sync complete, project scope active
```

In a `.kiro` repo: subagent list shows `kiro.*` (global) + `kiro-<project>.*` (project).

```
/kiro-context
```

## Limits

- Kiro MCP tools are not wired in Pi subagents
- Resource / prompt inlining caps apply (see `map-to-pi.ts`)
