import { execFile } from "node:child_process";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Marks the pi session name as manually set for Herdr subagent children.
 *
 * No-op unless HERDR_AGENT_CHILD=1 (this pi process is a herdr-agents
 * child). The orchestrator already names the pane via `herdr agent start
 * <name>`. This mirrors that pane label into pi.setSessionName() once at
 * session_start, so pi-autoname's respectManualName logic (already enabled
 * in pi-autoname.json) treats the name as manual and skips renaming it.
 */
export default function (pi: ExtensionAPI) {
  if (process.env.HERDR_AGENT_CHILD !== "1") return;
  if (!process.env.HERDR_PANE_ID) return;

  const herdrBin = process.env.HERDR_BIN_PATH || "herdr";

  pi.on("session_start", async () => {
    execFile(
      herdrBin,
      ["api", "snapshot"],
      { maxBuffer: 10 * 1024 * 1024 },
      (error, stdout) => {
        if (error) return;
        try {
          const snapshot = JSON.parse(stdout)?.result?.snapshot;
          const pane = snapshot?.panes?.find(
            (p: { pane_id?: string }) =>
              p.pane_id === process.env.HERDR_PANE_ID,
          );
          if (pane?.label) pi.setSessionName(pane.label);
        } catch {
          // Malformed snapshot — nothing to sync.
        }
      },
    );
  });
}
