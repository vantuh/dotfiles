# AGENTS.md — dotfiles repo

Personal dotfiles for macOS and WSL, managed with chezmoi.

## Structure

```
.chezmoiroot        Selects home/ as the chezmoi source-state root
home/               Source state mapped one-to-one to $HOME
  dot_config/       XDG application configs
    herdr/plugins/  Herdr plugin sources; linked after apply
  dot_local/bin/    Executable commands and thin shims
  dot_pi/agent/     Pi configuration and extensions
  dot_omp/private_agent/ Oh My Pi configuration and extensions (`0700`)
  .chezmoiscripts/  Migration and post-apply integration scripts
  .chezmoitemplates/ Shared rendered content
agents/             Shared AI skills/instructions; ~/.agents links here
scripts/            Repo-only utility implementations
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
  `home/dot_pi/agent/extensions/kiro-acp` is Pi. Read the copy's `README.md`;
  do not port changes across hosts unless asked.

## Rules

- **All config changes happen inside this repo, never directly in `$HOME`.**
  Apply them with `chezmoi apply` and test the resulting target.
- Do not modify shared agent instructions (`agents/.agents/AGENTS.md`) unless
  explicitly asked; changes affect Pi, OMP, OpenCode, Kiro, and Claude.
- Add shared skills under `agents/.agents/skills/<name>/SKILL.md`.
- Add managed home files under `home/` using the correct chezmoi attribute
  names. Update `home/.chezmoiignore.tmpl` for platform-only targets.
- Keep shell scripts POSIX-compatible where practical; bash-specific features
  are fine in files with a bash shebang.
- Do not write executable helpers in Python. For non-trivial helpers, use Bun
  and TypeScript in `scripts/*.ts` with a thin shim in
  `home/dot_local/bin/executable_*`. Trivial one-liners may use `node -e`.
- Validate source state with `chezmoi managed`, render/apply into an isolated
  destination, and exercise the changed runtime path before committing.
- This repo works directly on `main`; local commits are authorized. Never push
  unless the user asks.
