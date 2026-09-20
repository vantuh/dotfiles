#!/usr/bin/env bun
/**
 * Herdr tab watcher (socket API): renames tabs to reflect the foreground process.
 *
 * Event-driven: instead of forking the `herdr`
 * CLI every tick, it keeps one persistent NDJSON subscription connection to the
 * Herdr socket (`events.subscribe`) and reconciles tab labels only when Herdr
 * pushes a relevant event (pane.updated carries terminal title changes), plus
 * a low-frequency reconciliation snapshot as a self-heal. Zero process forks
 * in steady state; a socket roundtrip costs ~0.3-2 ms vs ~5-7 ms per CLI fork.
 *
 * Label heuristics and state semantics (manual renames, shell reset):
 * - Fast path from pane terminal titles ("π - ..." -> pi, "lazygit", "nvim",
 *   "hunk ...", "user@host:path" -> shell); ambiguous titles resolve via
 *   `pane.process_info` over the socket.
 * - Manual tab renames are respected: a tab is only renamed when its current
 *   label matches the label the watcher last set for it (or when the watcher
 *   has never renamed it).
 *
 * Usage: herdr-tab-watcher [--state FILE] [--reconcile-interval MS]
 */
import net from "node:net";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

/** Process name -> tab label. Unlisted processes use their own name. */
const LABEL_MAP: Record<string, string> = {
  lazygit: "lg",
  nvim: "nvim",
  nvimdiff: "nvim",
  pi: "pi",
  hunk: "hunk",
};

/** Processes that mean "nothing interesting is in the foreground". */
const SHELL_NAMES = new Set(["zsh", "bash", "sh", "fish", "dash", "ksh"]);

/** Runtimes/wrappers that merely host the real app (bun runs hunk, etc). */
const RUNTIME_NAMES = new Set([
  "node", "bun", "deno", "python", "python3",
  "npm", "npx", "pnpm", "yarn", "volta",
]);

/** Terminal-title first word -> foreground process name (pi sets "π - ..."). */
const TITLE_PROC: Record<string, string> = {
  "π": "pi",
};

/** zsh/bash prompt titles look like "user@host:cwd" (or "user@host cwd"). */
const SHELL_TITLE_RE = /^[^\s@]+@[^\s@]+[:\s]\S/;

/** Events that can affect tab labels. Wire names are snake_case. */
const WATCHED_EVENTS = new Set([
  "pane_updated", "pane_created", "pane_closed", "pane_moved", "pane_exited",
  "tab_created", "tab_closed", "tab_renamed",
  "workspace_closed",
]);

const SOCKET_PATH =
  process.env.HERDR_SOCKET_PATH ||
  path.join(os.homedir(), ".config", "herdr", "herdr.sock");

type ProcessInfo = { name?: string; argv0?: string };

type PaneCache = { pane_id: string; tab_id: string; terminal_title_stripped?: string };
type TabCache = { label: string; number: number; workspace_id?: string };

type Cache = {
  tabs: Map<string, TabCache>;
  panes: Map<string, PaneCache>;
};

function argAfter(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : undefined;
}

const STATE_FILE =
  argAfter("--state") ||
  path.join(os.homedir(), ".cache", "herdr", "tab-watcher-state.json");
const RECONCILE_INTERVAL = Number(argAfter("--reconcile-interval")) || 30_000;
const RECONCILE_DEBOUNCE = 150;
const VERBOSE = process.argv.includes("--verbose");

function log(msg: string): void {
  console.error(`herdr-tab-watcher: ${msg}`);
}

// ---------------------------------------------------------------------------
// Socket transport: request/response is one connection per request; the
// server closes request connections after answering. Subscriptions persist.
// ---------------------------------------------------------------------------

type JsonMsg = { id?: string; result?: any; error?: any; event?: string; data?: any };

function rpc(method: string, params: Record<string, unknown> = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    let buf = "";
    let done = false;
    Bun.connect({
      unix: SOCKET_PATH,
      socket: {
        data(socket, chunk) {
          buf += chunk;
          const i = buf.indexOf("\n");
          if (i >= 0 && !done) {
            done = true;
            socket.end();
            try {
              resolve(JSON.parse(buf.slice(0, i)) as JsonMsg);
            } catch (e) {
              reject(e);
            }
          }
        },
        error(socket, e) {
          if (!done) { done = true; reject(e); }
        },
        close() {
          if (!done) { done = true; reject(new Error("socket closed before response")); }
        },
      },
    })
      .then((socket) => {
        socket.write(JSON.stringify({ id: "r", method, params }) + "\n");
      })
      .catch(reject);
  });
}

async function subscribe(onEvent: (event: string, data: any) => void): Promise<() => void> {
  return await new Promise((resolveSub, rejectSub) => {
    let buf = "";
    let acked = false;
    let backoff = 1000;

    const connect = () => {
      Bun.connect({
        unix: SOCKET_PATH,
        socket: {
          data(_socket, chunk) {
            buf += chunk;
            let i: number;
            while ((i = buf.indexOf("\n")) >= 0) {
              const line = buf.slice(0, i);
              buf = buf.slice(i + 1);
              if (!line.trim()) continue;
              let msg: JsonMsg;
              try {
                msg = JSON.parse(line) as JsonMsg;
              } catch {
                continue;
              }
              if (!acked && msg.result?.type === "subscription_started") {
                acked = true;
                backoff = 1000;
                log("event subscription established");
                resolveSub(close);
                continue;
              }
              if (msg.event && WATCHED_EVENTS.has(msg.event)) {
                onEvent(msg.event, msg.data);
              }
            }
          },
          error(_socket, e) {
            log(`subscription socket error: ${e.message}`);
          },
          close() {
            if (!acked) {
              rejectSub(new Error("subscription closed before ack"));
              return;
            }
            log(`subscription lost, reconnecting in ${backoff}ms`);
            setTimeout(() => {
              backoff = Math.min(backoff * 2, 15_000);
              acked = false;
              buf = "";
              connect();
            }, backoff).unref();
          },
        },
      })
        .then((socket) => {
          (close as any)._socket = socket;
          socket.write(
            JSON.stringify({
              id: "s",
              method: "events.subscribe",
              params: {
                subscriptions: [...WATCHED_EVENTS].map((e) => ({
                  type: e.replaceAll("_", "."),
                })),
              },
            }) + "\n",
          );
        })
        .catch((e) => {
          if (!acked) rejectSub(e);
        });
    };

    function close(): void {
      (close as any)._socket?.end();
    }

    connect();
  });
}

// ---------------------------------------------------------------------------
// Label heuristics (shared with the polling watcher)
// ---------------------------------------------------------------------------

function baseName(proc: ProcessInfo): string {
  const raw = proc.argv0 || proc.name || "";
  return path.basename(raw).replace(/^-/, "");
}

function pickProcess(procs: ProcessInfo[]): ProcessInfo | null {
  if (procs.length === 0) return null;
  for (let i = procs.length - 1; i >= 0; i--) {
    if (LABEL_MAP[baseName(procs[i])]) return procs[i];
  }
  for (let i = procs.length - 1; i >= 0; i--) {
    const name = baseName(procs[i]);
    if (name && !RUNTIME_NAMES.has(name) && !SHELL_NAMES.has(name)) return procs[i];
  }
  return procs[0];
}

function labelFor(proc: ProcessInfo): string {
  const name = (proc.name || "").toLowerCase();
  return Object.hasOwn(LABEL_MAP, name) ? LABEL_MAP[name] : name;
}

/**
 * Cheap foreground guess from pane terminal titles.
 * Returns a process name, "shell", or null when the titles are ambiguous
 * and `pane.process_info` must be consulted.
 */
function titleGuessForTab(panes: PaneCache[]): string | "shell" | null {
  let sawPane = false;
  for (const pane of panes) {
    const title = pane.terminal_title_stripped?.trim();
    // Missing/unknown titles are ambiguous: defer to process_info.
    if (!title) return null;
    sawPane = true;
    if (SHELL_TITLE_RE.test(title)) continue;
    const first = title.split(/\s+/)[0].toLowerCase();
    if (SHELL_NAMES.has(first)) continue;
    // Object.hasOwn: a title like "constructor" must not hit prototypes.
    if (Object.hasOwn(TITLE_PROC, first)) return TITLE_PROC[first];
    if (Object.hasOwn(LABEL_MAP, first)) return first;
    return null;
  }
  return sawPane ? "shell" : null;
}

/** Foreground process of one pane over the socket (no fork). */
async function foregroundProcess(paneId: string): Promise<ProcessInfo | null> {
  let res: any;
  try {
    res = await rpc("pane.process_info", { pane_id: paneId });
  } catch {
    return null;
  }
  const procs =
    res?.result?.process_info?.foreground_processes ??
    res?.result?.foreground_processes;
  if (!Array.isArray(procs) || procs.length === 0) return null;
  const proc = pickProcess(procs);
  if (!proc) return null;
  const name = baseName(proc);
  if (!name || SHELL_NAMES.has(name)) return null;
  return { name };
}

// ---------------------------------------------------------------------------
// State (same semantics as the polling watcher)
// ---------------------------------------------------------------------------

function loadState(): Record<string, string> {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) as Record<string, string>;
  } catch {
    return {};
  }
}

function saveState(state: Record<string, string>): void {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + "\n");
}

// ---------------------------------------------------------------------------
// Reconcile: recompute labels for every tab, rename through the socket
// ---------------------------------------------------------------------------

function parseCache(snapshot: any): Cache {
  const cache: Cache = { tabs: new Map(), panes: new Map() };
  for (const t of snapshot?.tabs ?? []) {
    cache.tabs.set(t.tab_id, { label: t.label, number: t.number, workspace_id: t.workspace_id });
  }
  for (const p of snapshot?.panes ?? []) {
    cache.panes.set(p.pane_id, {
      tab_id: p.tab_id,
      terminal_title_stripped: p.terminal_title_stripped,
    });
  }
  return cache;
}

async function renameTab(tabId: string, label: string): Promise<void> {
  const res = await rpc("tab.rename", { tab_id: tabId, label });
  if (res?.error) throw new Error(res.error.message ?? "tab.rename failed");
}

async function reconcile(
  cache: Cache,
  state: Record<string, string>,
  liveTabs: Set<string>,
): Promise<void> {
  for (const tabId of Object.keys(state)) {
    if (!liveTabs.has(tabId)) delete state[tabId];
  }

  const panesByTab = new Map<string, PaneCache[]>();
  for (const [paneId, pane] of cache.panes) {
    const list = panesByTab.get(pane.tab_id) ?? [];
    list.push({ pane_id: paneId, tab_id: pane.tab_id, terminal_title_stripped: pane.terminal_title_stripped });
    panesByTab.set(pane.tab_id, list);
  }

  for (const [tabId, tab] of cache.tabs) {
    const panes = panesByTab.get(tabId) ?? [];
    if (panes.length === 0) continue;

    const guess = titleGuessForTab(panes);
    let proc: ProcessInfo | null;
    if (guess === "shell") {
      const lastSet = state[tabId];
      if (lastSet !== undefined && lastSet === tab.label && lastSet !== String(tab.number)) {
        // Watcher's own custom label still shown: verify before reset.
        proc = null;
        for (const pane of panes) {
          proc = await foregroundProcess(pane.pane_id);
          if (proc) break;
        }
      } else {
        proc = null;
      }
    } else if (guess !== null) {
      proc = { name: guess };
    } else {
      proc = null;
      for (const pane of panes) {
        proc = await foregroundProcess(pane.pane_id);
        if (proc) break;
      }
    }

    if (!proc) {
      // Shell-only tab: reset to the default label (tab number), but only
      // if the watcher renamed it before — manual names stay untouched.
      const lastSet = state[tabId];
      if (lastSet === undefined || lastSet !== tab.label) continue;
      const fallback = String(tab.number);
      if (fallback === tab.label) continue;
      try {
        await renameTab(tabId, fallback);
        state[tabId] = fallback;
      } catch {
        // ignore transient rename failures
      }
      continue;
    }

    const wanted = labelFor(proc);
    if (!wanted || wanted === tab.label) continue;

    const lastSet = state[tabId];
    // Respect manual renames: only touch tabs we renamed before,
    // or tabs the watcher has never labelled.
    if (lastSet !== undefined && lastSet !== tab.label) continue;

    try {
      await renameTab(tabId, wanted);
      state[tabId] = wanted;
    } catch {
      // ignore transient rename failures
    }
  }

  saveState(state);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const state = loadState();
  let cache: Cache = { tabs: new Map(), panes: new Map() };
  let reconciling: Promise<void> | null = null;

  async function reconcileNow(): Promise<void> {
    if (reconciling) return reconciling;
    reconciling = (async () => {
      try {
        const res = await rpc("session.snapshot", {});
        const snapshot = res?.result?.snapshot;
        if (!snapshot) return;
        cache = parseCache(snapshot);
        await reconcile(cache, state, new Set(cache.tabs.keys()));
      } catch (e: any) {
        log(`reconcile failed: ${e.message}`);
      } finally {
        reconciling = null;
      }
    })();
    return reconciling;
  }

  // Debounce event bursts (e.g. a tab closing emits several events).
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleReconcile = (): void => {
    if (debounceTimer) return;
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void reconcileNow();
    }, RECONCILE_DEBOUNCE);
    (debounceTimer as any).unref?.();
  };

  await subscribe((event, data) => {
    if (VERBOSE) log(`event ${event}: ${JSON.stringify(data ?? {}).slice(0, 120)}`);
    scheduleReconcile();
  });

  log(`watching socket ${SOCKET_PATH}, reconcile interval ${RECONCILE_INTERVAL}ms`);
  await reconcileNow();

  // Self-heal: periodic snapshot in case an event was missed (e.g. downtime).
  const intervalTimer = setInterval(() => void reconcileNow(), RECONCILE_INTERVAL);
  intervalTimer.unref?.();

  // Keep the process alive on the subscription connection.
  setInterval(() => {}, 60_000).unref();
}

void main();
