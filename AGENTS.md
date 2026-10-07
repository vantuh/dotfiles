# AGENTS.md — dotfiles repo

Personal dotfiles for macOS and WSL, managed with chezmoi.

## Structure

```
.chezmoiroot        Selects home/ as the chezmoi source-state root
home/               Source state mapped one-to-one to $HOME
  dot_config/       XDG application configs
    herdr/plugins/  Herdr plugin sources; linked after apply
  dot_local/bin/    Executable commands
  dot_pi/private_agent/     Pi configuration and extensions
    .settings.json  source-only; dest-symlinked from ~/.pi/agent/
  dot_pi/profiles/work/private_agent/  Pi work profile (`piw`): own .settings.json
                     (source-only, dest-symlinked) plus symlinks into
                     ~/.pi/agent for everything else it shares
  dot_omp/private_agent/ Oh My Pi configuration and extensions (`0700`)
    .config.yml / .kiro-acp.json  source-only; dest-symlinked from ~/.omp/agent/
  .chezmoiscripts/  Post-apply integration scripts
  .chezmoitemplates/ Shared rendered content
  .agents/          Shared AI skills/instructions (source-only; ~/.agents links here)
archive/            Retired configs kept for reference; never applied
```

## Conventions

- Source paths use chezmoi attributes: `dot_` for a leading dot,
  `executable_` for executable targets, `symlink_` for symlinks, and `.tmpl`
  for templates.
- Platform selection belongs in `home/.chezmoiignore.tmpl` or a narrowly
  scoped template/script, not in duplicate source trees.
- Runtime/generated files are never source state. Keep them out of `home/` or
  add a precise ignore when source-only material must live beside config.
- `kiro-acp` exists twice on purpose:
  `home/dot_omp/private_agent/extensions/kiro-acp` is Oh My Pi and
  `home/dot_pi/private_agent/extensions/kiro-acp` is Pi. Read the copy's `README.md`;
  do not port changes across hosts unless asked.

## Rules

- **All config changes happen inside this repo, never directly in `$HOME`.**
  Apply them with `chezmoi apply` and test the resulting target. Oh My Pi may
  write `~/.omp/agent/config.yml` and `~/.omp/agent/kiro-acp.json`; those dest
  paths are symlinks into this repo. Pi writes `~/.pi/agent/settings.json` and
  `~/.pi/profiles/work/agent/settings.json` in place, so those dest paths are
  symlinked too — use a writer that resolves symlinks before an atomic rename.
- Do not modify shared agent instructions (`home/.agents/AGENTS.md`) unless
  explicitly asked; changes affect Pi, OMP, OpenCode, Kiro, and Claude.
- Add shared skills under `home/.agents/skills/<name>/SKILL.md`.
- pi-subagents package agents that are not disabled in
  `home/dot_pi/private_agent/.settings.json` are mirrored into
  `home/dot_pi/private_agent/agents/` by `subagents-agents-sync`
  (`home/dot_local/bin/executable_subagents-agents-sync.ts`). Edit those copies
  freely; the pristine package version lives next to them in
  `home/dot_pi/private_agent/subagents-agents-base/` and is the merge base the script
  uses on upgrades. Never edit files under `subagents-agents-base/`.
- Refresh upstream skills with `skills-update` (`home/dot_local/bin/executable_skills-update`).
  It drives `npx skills` from `~/.agents`, which writes to `<cwd>/.agents/skills`,
  so `home/.agents/.agents/skills` must stay a symlink to `../skills`;
  flattening it silently sends updates to a duplicate directory instead of the
  repository.
- Add managed home files under `home/` using the correct chezmoi attribute
  names. Update `home/.chezmoiignore.tmpl` for platform-only targets.
- Keep shell scripts POSIX-compatible where practical; bash-specific features
  are fine in files with a bash shebang.
- Do not write executable helpers in Python. For non-trivial helpers, use Bun
  and TypeScript with `#!/usr/bin/env bun` in
  `home/dot_local/bin/executable_*.ts`. Trivial one-liners may use `node -e`.
- Validate source state with `chezmoi managed`, render/apply into an isolated
  destination, and exercise the changed runtime path before committing.
- This repo works directly on `main`; local commits are authorized. Never push
  unless the user asks.
