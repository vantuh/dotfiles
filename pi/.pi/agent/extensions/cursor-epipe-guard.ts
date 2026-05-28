/**
 * Suppress EPIPE from @cursor/sdk ZshState.execute.
 * The SDK writes to a zsh child process that may have already exited,
 * causing an unhandled EPIPE that crashes pi.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

function isCursorSdkEpipe(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	const e = error as NodeJS.ErrnoException;
	return e.code === "EPIPE" && e.syscall === "write" && (e.stack?.includes("@cursor/sdk") ?? false);
}

export default function (_pi: ExtensionAPI) {
	// Wrap process.emit to swallow EPIPE from cursor SDK shell writes.
	// Must run after cursor-sdk-abort-error-guard installs its own patch,
	// so we defer with queueMicrotask to ensure we wrap the final emit.
	queueMicrotask(() => {
		const prevEmit = process.emit.bind(process) as typeof process.emit;
		process.emit = function cursorEpipeGuard(event: string | symbol, ...args: unknown[]): boolean {
			if (event === "uncaughtException" && isCursorSdkEpipe(args[0])) {
				return false;
			}
			return (prevEmit as Function).call(process, event, ...args);
		} as typeof process.emit;
	});
}
