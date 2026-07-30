#!/usr/bin/env nub
/**
 * Open a file in an existing Neovim: Snacks ($NVIM), Herdr nvim tab, or local nvim.
 * Lazygit: os.edit / os.editAtLine. Args: [+LINE] FILE
 *
 * Herdr has no official TypeScript SDK — drive it via the `herdr` CLI (JSON out).
 */
import { execFileSync, spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { dirname } from "node:path";

type Pane = {
  pane_id: string;
  tab_id: string;
  cwd?: string;
  foreground_cwd?: string;
  terminal_title?: string;
  terminal_title_stripped?: string;
};

function run(
  cmd: string,
  args: string[],
  opts?: { stderr?: "ignore" | "pipe" },
): string {
  try {
    return execFileSync(cmd, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", opts?.stderr ?? "ignore"],
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

function hasCmd(name: string): boolean {
  return run("which", [name]) !== "";
}

function runNvim(args: string[]): never {
  const r = spawnSync("nvim", args, { stdio: "inherit" });
  process.exit(r.status ?? 1);
}

function vimEscape(path: string): string {
  return path
    .replaceAll("\\", "\\\\")
    .replaceAll(" ", "\\ ")
    .replaceAll("#", "\\#")
    .replaceAll("%", "\\%")
    .replaceAll("|", "\\|");
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

function gitRoot(path: string): string {
  if (!path) return "";
  return run("git", ["-C", path, "rev-parse", "--show-toplevel"]);
}

function openRemote(server: string, file: string, line: string): void {
  execFileSync("nvim", ["--server", server, "--remote-tab", file], {
    stdio: "inherit",
  });
  if (line) {
    execFileSync(
      "nvim",
      ["--server", server, "--remote-send", `:${line}<CR>`],
      {
        stdio: "inherit",
      },
    );
  }
}

function findNvimPane(
  fileRoot: string,
): { tab_id: string; pane_id: string } | null {
  const ws = process.env.HERDR_WORKSPACE_ID || "";
  const listArgs = ["pane", "list"];
  if (ws) listArgs.push("--workspace", ws);

  const listed = runJson<{ result: { panes: Pane[] } }>("herdr", listArgs);
  const panes = listed?.result?.panes;
  if (!Array.isArray(panes)) return null;

  type Candidate = { score: Array<number | string>; pane: Pane };
  const candidates: Candidate[] = [];

  for (const pane of panes) {
    const info = runJson<{ result: { process_info: { shell_pid?: number } } }>(
      "herdr",
      ["pane", "process-info", "--pane", pane.pane_id],
    )?.result?.process_info;
    if (!info?.shell_pid) continue;

    const title = String(
      pane.terminal_title_stripped || pane.terminal_title || "",
    ).toLowerCase();
    const hasNvim = descendants(Number(info.shell_pid)).some(
      (p) => procComm(p) === "nvim",
    );
    if (!hasNvim && !title.includes("nvim")) continue;

    const paneCwd = pane.cwd || pane.foreground_cwd || "";
    const nvimRoot = gitRoot(paneCwd);
    const sameRoot = Boolean(fileRoot && nvimRoot && fileRoot === nvimRoot);
    const titleNvim = title.includes("nvim");
    candidates.push({
      score: [
        sameRoot ? 0 : 1,
        titleNvim ? 0 : 1,
        hasNvim ? 0 : 1,
        pane.pane_id || "",
      ],
      pane,
    });
  }

  if (!candidates.length) return null;

  candidates.sort((a, b) => {
    for (let i = 0; i < a.score.length; i++) {
      if (a.score[i]! < b.score[i]!) return -1;
      if (a.score[i]! > b.score[i]!) return 1;
    }
    return 0;
  });

  const { pane } = candidates[0]!;
  return { tab_id: pane.tab_id, pane_id: pane.pane_id };
}

function openInHerdrPane(
  pane: { tab_id: string; pane_id: string },
  file: string,
  line: string,
): void {
  const escaped = vimEscape(file);
  const quiet = { stdio: ["ignore", "ignore", "ignore"] as const };

  execFileSync("herdr", ["tab", "focus", pane.tab_id], quiet);
  // Exit terminal mode without Esc — Esc cancels snacks explorer (picker).
  execFileSync(
    "herdr",
    ["pane", "send-keys", pane.pane_id, "ctrl+\\", "ctrl+n"],
    quiet,
  );
  execFileSync(
    "herdr",
    ["pane", "send-text", pane.pane_id, `:edit ${escaped}`],
    quiet,
  );
  execFileSync("herdr", ["pane", "send-keys", pane.pane_id, "enter"], quiet);
  if (line) {
    execFileSync(
      "herdr",
      ["pane", "send-text", pane.pane_id, `:${line}`],
      quiet,
    );
    execFileSync("herdr", ["pane", "send-keys", pane.pane_id, "enter"], quiet);
  }
}

function parseArgs(argv: string[]): {
  line: string;
  file: string;
  rest: string[];
} {
  let line = "";
  let file = "";
  const rest: string[] = [];
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i]!;
    if (arg.startsWith("+") && arg.length > 1 && !arg.includes("/")) {
      line = arg.slice(1);
      i++;
      continue;
    }
    if (arg === "--") {
      rest.push(...argv.slice(i + 1));
      break;
    }
    if (arg.startsWith("-")) {
      rest.push(...argv.slice(i));
      break;
    }
    file = arg;
    rest.push(...argv.slice(i + 1));
    break;
  }
  return { line, file, rest };
}

function main(): void {
  const { line, file: rawFile, rest } = parseArgs(process.argv.slice(2));

  if (!rawFile) {
    const args = [...(line ? [`+${line}`] : []), ...rest];
    runNvim(args);
  }

  let file: string;
  try {
    file = realpathSync(rawFile);
  } catch {
    file = rawFile;
  }

  // Snacks / nested Neovim terminal: $NVIM is the parent listen address
  if (process.env.NVIM) {
    openRemote(process.env.NVIM, file, line);
    return;
  }

  // Outside Herdr → plain blocking nvim
  if (process.env.HERDR_ENV !== "1" || !hasCmd("herdr")) {
    runNvim([...(line ? [`+${line}`] : []), "--", file, ...rest]);
  }

  const fileRoot = gitRoot(dirname(file)) || gitRoot(file);
  const pane = findNvimPane(fileRoot);
  if (!pane) {
    runNvim([...(line ? [`+${line}`] : []), "--", file, ...rest]);
  }

  openInHerdrPane(pane, file, line);
}

main();
