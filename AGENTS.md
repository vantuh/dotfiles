# AGENTS.md — dotfiles repo

Personal dotfiles for macOS and WSL, managed with GNU Stow.

## Structure

```
<package>/          Stow package — symlinked to $HOME
                    (zsh, starship, yazi, pi, omp, herdr, hunk, nvim,
                     karabiner, ghostty)
agents/             Shared AI agent skills & instructions (symlinked to Pi, OMP, OpenCode, Kiro, Claude)
  skills/           Shared SKILL.md files
  instructions/     Shared instruction files (AGENTS.md, caveman.md)
  links.json        Manifest: agent paths, skill targets, instruction targets
  link.sh           Creates symlinks from links.json (supports --dry-run)
  skills.json       GitHub sources for skill updates
  update-skills.sh  Fetch latest skills from GitHub
archive/            Retired configs kept for reference; never installed
install.sh          Cross-platform installer (stow + agent linking)
```

## Conventions

- Each top-level directory is a stow package mirroring `$HOME` structure.
- `agents/` is NOT a stow package — it uses its own `link.sh` for symlinks.
- Config files go inside their stow package at the path they'd have under `$HOME` (e.g. `zsh/.zshrc`, `pi/.pi/agent/settings.json`).
- `kiro-acp` exists twice, on purpose: `omp/.omp/agent/extensions/kiro-acp`
  is Oh My Pi (`omp`, `~/.omp`); `pi/.pi/agent/extensions/kiro-acp` is Pi
  (`pi`, `~/.pi`). They are not the same tree. Start at the copy's
  `README.md` before editing. Do not port a change across hosts unless
  asked.
- Platform-specific handling is in `install.sh`, not scattered across packages.

## Rules

- **All changes happen inside this repo, never directly in `$HOME`.** Create/edit files here, then symlink them (via stow or `agents/link.sh`). After linking, tell the user to test. Don't create config files in `~` — they'll drift out of sync with the repo.
- Don't modify shared agent instructions (`agents/.agents/AGENTS.md`) unless the user explicitly asks — changes apply to pi, OMP, OpenCode, and Kiro simultaneously.
- When adding a new stow package, add it to `COMMON_PACKAGES` or platform-specific list in `install.sh`.
- When adding a new shared skill, place it in `agents/skills/<name>/SKILL.md` and add targets to `agents/links.json`.
- Keep shell scripts POSIX-compatible where possible; bash-specific features are fine in `.sh` files with `#!/bin/bash`.
- Don't write executable helper scripts in Python. For anything more than a couple of lines, use bun + TypeScript (`#!/usr/bin/env bun` in `scripts/*.ts`, with a thin bash shim in `zsh/.local/bin/` — see `scripts/herdr-*.ts`). For trivial one-liners, use Node.js + JS (`node -e '...'`).
- Test `install.sh` changes with `--dry-run` flag on `link.sh` before committing.
- This repo works directly on `main`: committing there is authorized, no need to ask (see Incremental commits in the shared `AGENTS.md`). Pushing is still the user's job.
