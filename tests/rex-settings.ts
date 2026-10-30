import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const directory = mkdtempSync(resolve(".git/rex-settings-"));
const bin = `${directory}/bin`;
mkdirSync(bin);
const template = "home/.chezmoiscripts/run_after_40-configure-rex.sh.tmpl";
const script = execFileSync("chezmoi", ["execute-template", "-f", template], { encoding: "utf8" });
writeFileSync(`${directory}/apply.sh`, script);
writeFileSync(`${bin}/defaults`, '#!/bin/sh\nprintf "%s\\n" "$*" >> "$TEST_LOG"\n', { mode: 0o755 });
writeFileSync(`${bin}/rex`, "#!/bin/sh\nexit 99\n", { mode: 0o755 });
execFileSync("sh", [`${directory}/apply.sh`], {
  env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, TEST_LOG: `${directory}/calls` },
});
assert.deepEqual(readFileSync(`${directory}/calls`, "utf8").split("\n").slice(0, -1), [
  "write com.superlogical.rex Workspace.terminalFontName -string JetBrainsMonoNL Nerd Font",
  "write com.superlogical.rex Workspace.terminalFontStyle -string Light",
  "write com.superlogical.rex Workspace.terminalFontPointSize -float 14",
  "write com.superlogical.rex Workspace.terminalFontSmoothing -bool false",
  "write com.superlogical.rex Workspace.terminalStartupCommand -string ",
  "write com.superlogical.rex Workspace.terminalCopyOnSelect -bool true",
  "write com.superlogical.rex Workspace.terminalImproveTextContrast -bool true",
  "write com.superlogical.rex Workspace.appearance -string dark",
  "write com.superlogical.rex Workspace.lightThemeID -string merino-light",
  "write com.superlogical.rex Workspace.interfaceStyle -string blendTheme",
  "write com.superlogical.rex Workspace.appIconVisibility -string dockOnly",
  "write com.superlogical.rex Workspace.paneDensity -string compact",
  "write com.superlogical.rex Workspace.showsPaneHeaders -bool false",
  "write com.superlogical.rex Workspace.showsActivePaneBorder -bool true",
  "write com.superlogical.rex Workspace.activePaneBorderColor -string magenta",
  "write com.superlogical.rex Workspace.inactivePaneFadeMode -string both",
  "write com.superlogical.rex Workspace.usesStandardInactiveWindowPaneStyles -bool true",
  "write com.superlogical.rex Workspace.tintsPanesWithProgramBackground -bool true",
  "write com.superlogical.rex Workspace.focusFollowsMouse -bool true",
  "write com.superlogical.rex Workspace.sidebarPosition -string right",
  "write com.superlogical.rex Workspace.tabStyle -string horizontal",
  "write com.superlogical.rex Workspace.tabsFillAvailableSpace -bool false",
  "write com.superlogical.rex Workspace.tabIconCount -int 3",
  "write com.superlogical.rex Workspace.tabIconTintMode -string off",
  "write com.superlogical.rex Workspace.shellIconTheme -string default",
  "write com.superlogical.rex rex.agents.names-sessions -bool true",
  "write com.superlogical.rex rex.client.remoteControl -bool true",
  "write com.superlogical.rex rex.server.automatic-restart-enabled -bool true",
  "write com.superlogical.rex rex.server.block-plugin-reload-enabled -bool false",
]);
assert.equal(execFileSync("chezmoi", ["--override-data", '{"chezmoi":{"os":"linux"}}', "execute-template", "-f", template], { encoding: "utf8" }), "");
console.log("Rex preference checks passed");
