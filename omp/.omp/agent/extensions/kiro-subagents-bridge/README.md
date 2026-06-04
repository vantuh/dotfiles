# kiro-subagents-bridge

Loads company **Kiro CLI agents** (`*.json`) into **OMP task agents** without modifying git repos.

## Behavior

**No background watchers.** Sync once per `session_start`. Cleanup on `session_shutdown` (quit).

### Global agents

- Source: `~/.kiro/agents/*.json`
- Output: `~/.omp/agent/agents/kiro-active/global/*.md`
- OMP **user** scope (every session)
- Package: `kiro` → runtime name `kiro.<agent-name>`

### Project agents (per repo)

- Source: `{kiroRoot}/.kiro/agents/*.json`
- Output: `~/.omp/agent/agents/kiro-active/<project-basename>/*.md`
- OMP discovers them under `~/.omp/agent/agents/` (recursive scan)
- Package: `kiro-<project-basename>` → runtime name `kiro-<basename>.<agent-name>`
- **Cleaned up on session quit** so agents from one project don't linger in another

## Setup

Extensions live under `~/.omp/agent/extensions/` (stowed from `omp/.omp/agent/extensions/`).

```bash
cd ~/dotfiles && ./install.sh
```

Requires `kiro-acp` extension in the same `extensions/` directory for model mapping.

## Verify

```bash
tail -f /tmp/kiro-subagents-bridge-debug.log
# expect: extension loaded, sync complete, project scope active
```

In a `.kiro` repo: task agent list shows `kiro.*` (global) + `kiro-<project>.*` (project).

```
/kiro-context
```

## Limits

- Kiro MCP tools are not wired in OMP task agents
- Resource / prompt inlining caps apply (see `map-to-pi.ts`)
