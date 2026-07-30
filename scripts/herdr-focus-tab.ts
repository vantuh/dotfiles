#!/usr/bin/env nub
/**
 * Focus a Herdr tab by label in the current workspace.
 * Create the tab and run a command if the tab/process is missing.
 *
 * Usage: herdr-focus-tab <label> [--cwd PATH] -- <cmd> [args...]
 *   herdr-focus-tab lg --cwd ~/repo -- lazygit
 *   herdr-focus-tab hunk --cwd ~/repo -- hunk diff --watch
 */
import { execFileSync } from "node:child_process";

type Pane = {
  pane_id: string;
  tab_id: string;
  workspace_id?: string;
};

type Tab = {
  tab_id: string;
  workspace_id: string;
  label?: string;
};

const quiet = { stdio: ["ignore", "ignore", "ignore"] as const };

function run(cmd: string, args: string[]): string {
  try {
    return execFileSync(cmd, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function runJson<T>(cmd: string, args: string[]): T | null {
  const out = run(cmd, args);
  if (!out) return null;
  try {
    return JSON.parse(out) as T;
  } catch {
    return null;
  }
}

function pgrepChildren(pid: number): number[] {
  const out = run("pgrep", ["-P", String(pid)]);
  if (!out) return [];
  return out.split(/\s+/).filter(Boolean).map(Number);
}

function descendants(pid: number): number[] {
  const found: number[] = [];
  const stack = [pid];
  const seen = new Set<number>();
  while (stack.length) {
    const cur = stack.pop()!;
    if (seen.has(cur)) continue;
    seen.add(cur);
    const kids = pgrepChildren(cur);
    found.push(...kids);
    stack.push(...kids);
  }
  return found;
}

function procComm(pid: number): string {
  return run("ps", ["-o", "comm=", "-p", String(pid)]);
}

function paneHasCmd(paneId: string, cmd: string): boolean {
  const info = runJson<{ result: { process_info: { shell_pid?: number } } }>(
    "herdr",
    ["pane", "process-info", "--pane", paneId],
  )?.result?.process_info;
  if (!info?.shell_pid) return false;
  const base = cmd.split("/").pop() || cmd;
  return descendants(Number(info.shell_pid)).some((p) => procComm(p) === base);
}

function findLabeledTab(ws: string, label: string): Tab | null {
  const listed = runJson<{ result: { tabs: Tab[] } }>("herdr", [
    "tab",
    "list",
    "--workspace",
    ws,
  ]);
  const tabs = listed?.result?.tabs;
  if (!Array.isArray(tabs)) return null;
  const want = label.toLowerCase();
  const matches = tabs.filter((t) => String(t.label || "").toLowerCase() === want);
  if (!matches.length) return null;
  matches.sort((a, b) => a.tab_id.localeCompare(b.tab_id));
  return matches[0]!;
}

function firstPaneOfTab(tabId: string, ws: string): Pane | null {
  const listed = runJson<{ result: { panes: Pane[] } }>("herdr", [
    "pane",
    "list",
    "--workspace",
    ws,
  ]);
  const panes = listed?.result?.panes;
  if (!Array.isArray(panes)) return null;
  const inTab = panes.filter((p) => p.tab_id === tabId);
  if (!inTab.length) return null;
  inTab.sort((a, b) => a.pane_id.localeCompare(b.pane_id));
  return inTab[0]!;
}

function parseArgs(argv: string[]): {
  label: string;
  cwd: string;
  cmd: string[];
} {
  if (!argv[0] || argv[0].startsWith("-")) {
    console.error(
      "usage: herdr-focus-tab <label> [--cwd PATH] -- <cmd> [args...]",
    );
    process.exit(2);
  }
  const label = argv[0]!;
  let cwd = "";
  let i = 1;
  while (i < argv.length) {
    const a = argv[i]!;
    if (a === "--cwd" && argv[i + 1]) {
      cwd = argv[i + 1]!;
      i += 2;
      continue;
    }
    if (a === "--") {
      i++;
      break;
    }
    console.error(`herdr-focus-tab: unexpected arg: ${a}`);
    process.exit(2);
  }
  const cmd = argv.slice(i);
  if (!cmd.length) {
    console.error("herdr-focus-tab: missing command after --");
    process.exit(2);
  }
  return { label, cwd: cwd || process.cwd(), cmd };
}

function main(): void {
  if (process.env.HERDR_ENV !== "1") {
    console.error("herdr-focus-tab: not inside Herdr (HERDR_ENV≠1)");
    process.exit(1);
  }

  const ws = process.env.HERDR_WORKSPACE_ID || "";
  if (!ws) {
    console.error("herdr-focus-tab: HERDR_WORKSPACE_ID unset");
    process.exit(1);
  }

  const { label, cwd, cmd } = parseArgs(process.argv.slice(2));
  const labeled = findLabeledTab(ws, label);

  if (labeled) {
    const pane = firstPaneOfTab(labeled.tab_id, ws);
    if (!pane) {
      console.error(`herdr-focus-tab: tab ${label} has no pane`);
      process.exit(1);
    }
    execFileSync("herdr", ["tab", "focus", labeled.tab_id], quiet);
    if (!paneHasCmd(pane.pane_id, cmd[0]!)) {
      execFileSync("herdr", ["pane", "run", pane.pane_id, ...cmd], quiet);
    }
    return;
  }

  const createArgs = [
    "tab",
    "create",
    "--label",
    label,
    "--focus",
    "--workspace",
    ws,
  ];
  if (cwd) createArgs.push("--cwd", cwd);

  const created = runJson<{
    result: { root_pane: Pane; tab: Tab };
  }>("herdr", createArgs);
  const root = created?.result?.root_pane;
  if (!root?.pane_id) {
    console.error(`herdr-focus-tab: failed to create tab ${label}`);
    process.exit(1);
  }

  execFileSync("herdr", ["pane", "run", root.pane_id, ...cmd], quiet);
}

main();
