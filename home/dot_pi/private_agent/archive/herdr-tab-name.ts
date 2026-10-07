import { execFile } from "node:child_process";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Syncs the pi session name to the Herdr tab running this session.
 *
 * No-op outside Herdr (HERDR_PANE_ID unset) or inside a Herdr subagent
 * child session (HERDR_AGENT_CHILD=1) — the orchestrator names those tabs
 * itself via herdr-agents. On session_start, renames the tab to the
 * session's existing name if one is already set (e.g. resumed session),
 * otherwise to "pi". Keeps it in sync afterwards via session_info_changed
 * — fired by /name, RPC, or pi.setSessionName(), which includes
 * pi-autoname's automatic and periodic renames.
 */
export default function (pi: ExtensionAPI) {
  if (!process.env.HERDR_PANE_ID) return;
  if (process.env.HERDR_AGENT_CHILD === "1") return;

  const herdrBin = process.env.HERDR_BIN_PATH || "herdr";

  const renameTab = (name: string) => {
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
          if (!pane?.tab_id) return;
          execFile(herdrBin, ["tab", "rename", pane.tab_id, name], () => {});
        } catch {
          // Malformed snapshot — nothing to sync.
        }
      },
    );
  };

  pi.on("session_start", async () => {
    renameTab(pi.getSessionName() || "pi");
  });

  pi.on("session_info_changed", async (event) => {
    if (event.name) renameTab(event.name);
  });
}
