#!/usr/bin/env nub
/**
 * Set up the standard Herdr workspace layout.
 *
 * Renames the current tab to "Orchestrator", then creates supporting tabs
 * in the same workspace: lazygit, hunk_review, tests (split), and run.
 * Finally refocuses the original tab.
 *
 * Usage: herdr-setup
 */
import { execFileSync } from "node:child_process";

type Pane = {
  pane_id: string;
  tab_id: string;
  workspace_id?: string;
  focused?: boolean;
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

function fail(msg: string): never {
  console.error(`herdr-setup: ${msg}`);
  process.exit(1);
}

/** Create a tab in the workspace and return its root pane id. */
function createTab(ws: string, label: string): string {
  const created = runJson<{ result: { root_pane: Pane } }>("herdr", [
    "tab",
    "create",
    "--workspace",
    ws,
    "--label",
    label,
    "--no-focus",
  ]);
  const paneId = created?.result?.root_pane?.pane_id;
  if (!paneId) fail(`failed to create tab ${label}`);
  return paneId;
}

function main(): void {
  const listed = runJson<{ result: { panes: Pane[] } }>("herdr", [
    "pane",
    "list",
  ]);
  const panes = listed?.result?.panes;
  if (!Array.isArray(panes)) fail("could not list panes");

  const focused = panes.find((p) => p.focused);
  if (!focused) fail("no focused pane");
  const currentTab = focused.tab_id;
  const ws = focused.workspace_id;
  if (!ws) fail("focused pane has no workspace_id");

  execFileSync("herdr", ["tab", "rename", currentTab, "agent"], quiet);

  const nvimPane = createTab(ws, "nvim");
  execFileSync("herdr", ["pane", "run", nvimPane, "nvim"], quiet);

  const lazygitPane = createTab(ws, "lg");
  execFileSync("herdr", ["pane", "run", lazygitPane, "lg"], quiet);

  const hunkPane = createTab(ws, "hunk");
  execFileSync("herdr", ["pane", "run", hunkPane, "hunk diff --watch"], quiet);

  const testsPane = createTab(ws, "tests");
  execFileSync(
    "herdr",
    ["pane", "split", testsPane, "--direction", "right", "--no-focus"],
    quiet,
  );

  createTab(ws, "run");

  execFileSync("herdr", ["tab", "focus", currentTab], quiet);
}

main();
