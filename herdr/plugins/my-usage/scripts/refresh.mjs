#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import {
  herdrBin,
  readContext,
  runMyUsage,
  workspaceId,
} from "./lib.mjs";
import { parseUsageOutput } from "./parse-usage.mjs";

const context = readContext();
const ws = workspaceId(context);
if (!ws) {
  console.error("usage refresh: no workspace id in plugin context");
  process.exit(1);
}

let output;
try {
  output = runMyUsage();
} catch (error) {
  console.error(`usage refresh: ${error.message}`);
  process.exit(1);
}

const parsed = parseUsageOutput(output);
const herdr = herdrBin();
const ttlMs = Number(process.env.MY_USAGE_TTL_MS ?? 300_000);
const args = [
  "workspace",
  "report-metadata",
  ws,
  "--source",
  "vantuh.my-usage",
  "--ttl-ms",
  String(ttlMs),
];

for (const [name, value] of Object.entries(parsed.tokens)) {
  args.push("--token", `${name}=${value}`);
}

const result = spawnSync(herdr, args, { encoding: "utf8" });
if (result.status !== 0) {
  const message =
    result.stderr?.trim() || result.stdout?.trim() || "unknown error";
  console.error(`usage refresh: herdr failed: ${message}`);
  process.exit(result.status ?? 1);
}

process.stdout.write(`${parsed.tokens.usage}\n`);
