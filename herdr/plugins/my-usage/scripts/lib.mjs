import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";

const PATH_DIRS = [
  `${homedir()}/.local/bin`,
  "/opt/homebrew/bin",
  "/usr/local/bin",
  `${homedir()}/.bun/bin`,
  `${homedir()}/.cargo/bin`,
];

export function pluginPath() {
  const extra = PATH_DIRS.filter((dir) => existsSync(dir)).join(":");
  return extra ? `${extra}:${process.env.PATH ?? ""}` : process.env.PATH ?? "";
}

export function herdrBin() {
  return process.env.HERDR_BIN_PATH ?? "herdr";
}

export function myUsageBin() {
  const override = process.env.MY_USAGE_BIN?.trim();
  if (override) return override;

  const env = { ...process.env, PATH: pluginPath() };
  const found = spawnSync("bash", ["-lc", "command -v my-usage"], {
    encoding: "utf8",
    env,
  });
  const path = found.stdout?.trim();
  if (path) return path;

  const fallback = `${homedir()}/.local/bin/my-usage`;
  if (existsSync(fallback)) return fallback;

  return "my-usage";
}

export function readContext() {
  const raw = process.env.HERDR_PLUGIN_CONTEXT_JSON;
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function workspaceId(context = readContext()) {
  return (
    process.env.HERDR_WORKSPACE_ID ??
    context.workspace_id ??
    context.focused_workspace_id
  );
}

export function runMyUsage() {
  const bin = myUsageBin();
  const shell = process.env.SHELL || "/bin/zsh";
  const env = { ...process.env, PATH: pluginPath() };

  const result = spawnSync(shell, ["-lic", bin], {
    encoding: "utf8",
    env,
    timeout: 120_000,
  });

  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  if (!output && result.status !== 0) {
    throw new Error(`my-usage failed (${result.status ?? "unknown"})`);
  }
  return output;
}
