export const KIRO_ACP_PROVIDER = "kiro-acp";

/** Kiro/ACP context-limit errors — avoid rate-limit / throttle phrases. */
const KIRO_CONTEXT_OVERFLOW_PATTERN =
  /(context\s*(window|length|limit)|maximum\s+(allowed\s+)?input|input\s+(is\s+)?too\s+long|prompt\s+is\s+too\s+long|exceeds?\s+(the\s+)?(max(imum)?\s+)?(context|token|length)|token\s+limit|too\s+many\s+tokens)/i;

const RATE_LIMIT_PATTERN = /rate\s*limit|too\s+many\s+requests|throttl/i;

type AssistantErrorMessage = {
  role: string;
  stopReason?: string;
  provider?: string;
  errorMessage?: string;
};

/**
 * Prefix Kiro context-limit errors with omp's generic overflow marker
 * (`context[_ ]length[_ ]exceeded`, matched by @oh-my-pi/pi-ai's
 * GENERIC_LIMIT_OVERFLOW_PATTERN) so the session classifies the turn as
 * context overflow and triggers auto-compaction recovery.
 *
 * omp ignores the return value of `message_end` handlers (notification-only
 * event), so this must run where the AssistantMessage is created — the
 * streamSimple error paths in stream.ts.
 */
export function classifyKiroContextOverflow(
  message: AssistantErrorMessage,
): string | undefined {
  if (message.role !== "assistant") return;
  if (message.stopReason !== "error") return;
  if (message.provider !== KIRO_ACP_PROVIDER) return;

  const errorMessage = message.errorMessage ?? "";
  if (errorMessage.includes("context_length_exceeded")) return;
  if (RATE_LIMIT_PATTERN.test(errorMessage)) return;
  if (!KIRO_CONTEXT_OVERFLOW_PATTERN.test(errorMessage)) return;

  return `context_length_exceeded: ${errorMessage}`;
}
