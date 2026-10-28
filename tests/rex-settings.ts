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
]);
assert.equal(execFileSync("chezmoi", ["--override-data", '{"chezmoi":{"os":"linux"}}', "execute-template", "-f", template], { encoding: "utf8" }), "");
console.log("Rex font preference checks passed");
