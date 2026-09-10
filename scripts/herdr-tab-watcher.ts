#!/usr/bin/env nub
/**
 * Herdr tab watcher: renames tabs to reflect the foreground process.
 *
 * Polls every second per pane in the current Herdr session, detects the foreground
 * process via `herdr pane process-info`, and renames the owning tab using
 * a label map (nvim -> nvim, lazygit -> lg, pi -> pi, hunk -> hunk, ...).
 * Unknown processes fall back to their own name.
 *
 * Rules:
 * - Tabs whose foreground is just the shell are left untouched.
 * - Manual tab renames are respected: a tab is only renamed when its
 *   current label matches the label the watcher last set for it (or when
 *   the watcher has never renamed it). State persists across restarts.
 *
 * Usage: herdr-tab-watcher [--interval MS]   (default 1000)
 */
import { execFileSync } from "node:child_process";
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

const STATE_FILE = path.join(os.homedir(), ".cache", "herdr", "tab-watcher-state.json");

type ProcessInfo = {
  name?: string;
  argv0?: string;
};

type Pane = { pane_id: string; tab_id: string };

type Tab = { tab_id: string; label: string };

function runJson<T>(cmd: string, args: string[]): T | null {
  try {
    const out = execFileSync(cmd, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    if (!out.trim()) return null;
    return JSON.parse(out) as T;
  } catch {
    return null;
  }
}

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

function baseName(proc: ProcessInfo): string {
  const raw = proc.argv0 || proc.name || "";
  return path.basename(raw).replace(/^-/, "");
}

/**
 * The list is the foreground process tree, but the order of wrappers vs the
 * real app is not guaranteed (pi runs last under kiro wrappers; hunk runs
 * first under bun). Pick by priority, scanning from the innermost process:
 * 1. a process explicitly mapped in LABEL_MAP (e.g. pi, hunk),
 * 2. the first non-runtime process (skips bun/node/deno hosts),
 * 3. fall back to the first entry.
 */
function pickProcess(procs: ProcessInfo[]): ProcessInfo | null {
  if (procs.length === 0) return null;
  for (let i = procs.length - 1; i >= 0; i--) {
    if (baseName(procs[i]) in LABEL_MAP) return procs[i];
  }
  for (let i = procs.length - 1; i >= 0; i--) {
    const name = baseName(procs[i]);
    if (name && !RUNTIME_NAMES.has(name) && !SHELL_NAMES.has(name)) return procs[i];
  }
  return procs[0];
}

/** Foreground process of a pane, or null when it is just the shell. */
function foregroundProcess(paneId: string): ProcessInfo | null {
  const res = runJson<{ result: { process_info: { foreground_processes: ProcessInfo[] } } }>(
    "herdr",
    ["pane", "process-info", "--pane", paneId],
  );
  const procs = res?.result?.process_info?.foreground_processes;
  if (!Array.isArray(procs) || procs.length === 0) return null;
  const name = baseName(pickProcess(procs));
  if (!name || SHELL_NAMES.has(name)) return null;
  return { name };
}

/** Pick the most interesting foreground process across a tab's panes. */
function tabProcess(paneIds: string[]): ProcessInfo | null {
  for (const paneId of paneIds) {
    const proc = foregroundProcess(paneId);
    if (proc) return proc;
  }
  return null;
}

function labelFor(proc: ProcessInfo): string {
  const name = (proc.name || "").toLowerCase();
  return LABEL_MAP[name] ?? name;
}

function tick(state: Record<string, string>): void {
  const snap = runJson<{
    result: { snapshot: { panes: Pane[]; tabs: Tab[] } };
  }>("herdr", ["api", "snapshot"]);
  const snapshot = snap?.result?.snapshot;
  if (!snapshot || !Array.isArray(snapshot.tabs)) return;

  const liveTabs = new Set(snapshot.tabs.map((t) => t.tab_id));
  for (const tabId of Object.keys(state)) {
    if (!liveTabs.has(tabId)) delete state[tabId];
  }

  const panesByTab = new Map<string, string[]>();
  for (const pane of snapshot.panes) {
    const list = panesByTab.get(pane.tab_id) ?? [];
    list.push(pane.pane_id);
    panesByTab.set(pane.tab_id, list);
  }

  for (const tab of snapshot.tabs) {
    const paneIds = panesByTab.get(tab.tab_id) ?? [];
    if (paneIds.length === 0) continue;
    const proc = tabProcess(paneIds);

    if (!proc) {
      // Shell-only tab: reset to the default label (tab number), but only
      // if the watcher renamed it before — manual names stay untouched.
      const lastSet = state[tab.tab_id];
      if (lastSet === undefined || lastSet !== tab.label) continue;
      const fallback = String(tab.number);
      if (fallback === tab.label) continue;
      try {
        execFileSync("herdr", ["tab", "rename", tab.tab_id, fallback], {
          stdio: "ignore",
          timeout: 5000,
        });
        state[tab.tab_id] = fallback;
      } catch {
        // ignore transient rename failures
      }
      continue;
    }

    const wanted = labelFor(proc);
    if (!wanted || wanted === tab.label) continue;

    const lastSet = state[tab.tab_id];
    // Respect manual renames: only touch tabs we renamed before,
    // or tabs the watcher has never labelled.
    if (lastSet !== undefined && lastSet !== tab.label) continue;

    try {
      execFileSync("herdr", ["tab", "rename", tab.tab_id, wanted], {
        stdio: "ignore",
        timeout: 5000,
      });
      state[tab.tab_id] = wanted;
    } catch {
      // ignore transient rename failures
    }
  }

  saveState(state);
}

function main(): void {
  const intervalArg = process.argv.indexOf("--interval");
  const interval = intervalArg > -1 ? Number(process.argv[intervalArg + 1]) || 1000 : 1000;

  const state = loadState();
  console.error(`herdr-tab-watcher: polling every ${interval}ms`);
  for (;;) {
    tick(state);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, interval);
  }
}

main();
