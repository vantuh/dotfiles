# kiro-acp (Oh My Pi)

This directory is the **Oh My Pi** copy of the Kiro ACP provider. Edit it when
the host is `omp`. Stow maps it to `~/.omp/agent/extensions/kiro-acp`.

It is **not** the Pi copy. The two trees started as the same extension and
then diverged. A change here does not appear in Pi, and a change there does
not appear here.

| | Oh My Pi (this tree) | Pi |
|---|---|---|
| Repo | [`omp/.omp/agent/extensions/kiro-acp`](.) | [`pi/.pi/agent/extensions/kiro-acp`](../../../../../pi/.pi/agent/extensions/kiro-acp) |
| Loaded from | `~/.omp/agent/extensions/kiro-acp` | `~/.pi/agent/extensions/kiro-acp` |
| Config | `~/.omp/agent/kiro-acp.json` → [`omp/.omp/agent/kiro-acp.json`](../../kiro-acp.json) | `~/.pi/agent/kiro-acp.json` |
| Host binary | `omp` | `pi` |

## What "pi" means in this tree

Oh My Pi is a fork of `pi-coding-agent`. The extension API, npm scope, MCP
server name, and much of the history still say **pi**:

- Host types: `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`
- Default export still receives `pi: ExtensionAPI`
- MCP server registered with Kiro is still named `pi_host`
- Env knobs are still `PI_KIRO_ACP_*`
- Kiro agent names are still `pi-kiro-<id>` (written into a per-session temp
  root, not into Pi's tree)

In the ADRs and debug docs, **pi = the host SDK / tool loop**, not the `pi`
stow package and not `~/.pi`.

## History and docs

- [ADR 0001 — in-process HTTP MCP tool transport](docs/adr/0001-in-process-http-mcp-tool-transport.md)
- [ADR 0002 — surviving Kiro's 120s MCP tool-call deadline](docs/adr/0002-surviving-kiro-mcp-tool-call-deadline.md)
- [Debug logging](docs/DEBUG-LOGGING.md)
- [E2E live probe](test/e2e/README.md)

Those files keep the original decision history. They were written against Pi
and later ported. Read them as the transport design, then apply paths from
the table above.

## Namespaced runtime paths (omp vs Pi)

These used to share Pi's names and would collide if both hosts ran on the
same machine. This copy now owns its own:

| What | This copy | Pi copy |
|---|---|---|
| Debug log | `$TMPDIR/omp-kiro-acp-debug.log` | `$TMPDIR/kiro-acp-debug.log` |
| Persisted ACP sessions | `~/.local/share/omp-kiro-acp/` | `~/.local/share/pi-kiro-acp/` |
| Agent scratch dir | `$TMPDIR/omp-kiro-acp/agent-root-<id>` | `$TMPDIR/kiro-acp/agent-root-<id>` |

`pi_host`, `pi-kiro-<id>`, and `PI_KIRO_ACP_*` stay as protocol / SDK names.
They are not file-system collisions.

## Tests

```sh
./test/run-all.sh
```

Uses pi-coding-agent's vendored `node_modules` (see `.gitignore`) because omp
remaps `@earendil-works/*` only when the extension is loaded inside omp.
