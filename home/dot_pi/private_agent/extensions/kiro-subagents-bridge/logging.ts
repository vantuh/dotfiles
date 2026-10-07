import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

export const LOG_FILE = join(tmpdir(), "kiro-subagents-bridge-debug.log");

export function log(...args: unknown[]): void {
	const ts = new Date().toISOString().slice(11, 23);
	const line = args
		.map((a) => (typeof a === "object" && a !== null ? JSON.stringify(a) : String(a)))
		.join(" ");
	appendFileSync(LOG_FILE, `[${ts}] ${line}\n`);
}
