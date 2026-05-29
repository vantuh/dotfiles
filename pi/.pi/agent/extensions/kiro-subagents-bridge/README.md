# kiro-subagents-bridge

Loads company **Kiro CLI agents** (`*.json`) into **pi-subagents** without modifying git repos or patching the pi-subagents package.

## Behavior

**No background watchers.** Sync once per `session_start`. **No files in git repos** (no `.pi/agents/kiro` symlinks).

### Global agents

- Source: `~/.kiro/agents/*.json`
- Cache: `~/.pi/agent/agents/kiro-active/global/*.md`
- pi-subagents **user** scope (every session)

### Project agents (per repo, parallel Pi safe)

- Source: `{kiroRoot}/.kiro/agents/*.json`
- Cache: `~/.pi/agent/kiro-by-repo/<repo-id>/*.md` (outside `agents/`, so other repos never see them)
- At discovery time, `preload.ts` wraps pi-subagents `discoverAgents()` and injects only the cache for the **current** `kiroRoot` (from cwd)
- pi-subagents treats them as **project** scope when cwd is under that repo

Two Pi sessions in two different repos: separate cache dirs, separate discovery — no overwrite.

### Package load order

Registered as a **local pi package** in `settings.json` **before** `npm:pi-subagents`, so `preload.ts` patches discovery before the subagents extension starts.

## Setup

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
# expect: discover patch installed
```

In a `.kiro` repo: subagent list shows `kiro.*` for global + this repo only.

```
/kiro-context
```

## Limits

- Kiro MCP tools are not wired in Pi subagents
- Resource / prompt inlining caps apply (see `map-to-pi.ts`)
