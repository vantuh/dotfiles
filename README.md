# dotfiles

Cross-platform macOS and WSL dotfiles managed with [chezmoi](https://www.chezmoi.io/).

## Layout

`.chezmoiroot` points chezmoi at `home/`. Paths below that directory map
one-to-one to `$HOME` using chezmoi's source-state naming:

| Source | Target |
| --- | --- |
| `home/dot_zshrc` | `~/.zshrc` |
| `home/dot_config/nvim` | `~/.config/nvim` |
| `home/dot_config/herdr` | `~/.config/herdr` |
| `home/dot_config/llama-swap` | `~/.config/llama-swap` (WSL) |
| `home/dot_local/bin` | `~/.local/bin` |
| `home/dot_pi/agent` | `~/.pi/agent` |
| `home/dot_omp/private_agent` | `~/.omp/agent` (`0700`) |
| `home/.agents` | `~/.agents` (symlink into the repo) |
| `home/Library/Application Support/...` | `~/Library/Application Support/...` |

`home/.chezmoiignore.tmpl` selects platform-specific targets. macOS receives
Karabiner, Ghostty, and the macOS Lazygit path. Linux receives the XDG Lazygit
path; WSL additionally receives `llama-update`, `~/.config/llama-swap`, and
Windows Terminal settings.

Repository-only content stays outside `home/`:

| Directory | Contents |
| --- | --- |
| `fan_control` | Fan Control config and research notes |
| `openspec` | OpenSpec design documents |
| `archive` | Retired tmux and Alacritty configs; never applied |

## Prerequisites

- [chezmoi](https://www.chezmoi.io/install/)
- Git
- [Homebrew](https://brew.sh/) on macOS or
  [Linuxbrew](https://docs.brew.sh/Homebrew-on-Linux) on WSL
- [JetBrainsMono Nerd Font](https://www.nerdfonts.com/font-downloads)

## Installation

```bash
git clone git@github.com:vantuh/dotfiles.git ~/dotfiles
chezmoi init --source ~/dotfiles --apply
chsh -s "$(command -v zsh)"
```

The generated chezmoi config keeps the clone as `sourceDir`. The first apply
removes legacy Stow symlinks and backs up pre-existing Pi/OMP generated configs
before replacing them. On WSL, an apply also links (or copies, if Windows
symlink creation is unavailable) Windows Terminal settings.

Restart the terminal after the first apply. Zinit installs shell plugins on the
first interactive launch.

## Daily workflow

Edit files in this repository, never the generated copies under `$HOME`.

```bash
chezmoi diff
chezmoi apply
chezmoi update
```

`chezmoi apply <target>` limits an apply to one target or subtree. The `dotfix`
shell helper runs `chezmoi update`.

## Shared agent skills

`home/.agents/` is the source of truth for skills and shared instructions.
It is named `.agents` rather than `dot_agents` so chezmoi ignores the files
(source entries starting with `.` are not applied) and only the symlink is
applied. Chezmoi creates `~/.agents` as a symlink to that directory, then
links its `skills` and `AGENTS.md` into Pi, OpenCode, Kiro, and Claude as
appropriate. Writes through any linked agent path therefore update the
repository.

To add a shared skill, create
`home/.agents/skills/<name>/SKILL.md`, then run `chezmoi apply`.

## Retired Pi extensions

Retired personal extensions live under `home/dot_pi/agent/archive/` and are
excluded from the applied state. See its `README.md` for history and restore
instructions.

## Two kiro-acp trees

`kiro-acp` is vendored separately for each host. The trees have diverged and
must not be updated as if they were mirrors.

| Host | Source path | Applied path |
| --- | --- | --- |
| Oh My Pi (`omp`) | `home/dot_omp/private_agent/extensions/kiro-acp` | `~/.omp/agent/extensions/kiro-acp` |
| Pi (`pi`) | `home/dot_pi/agent/extensions/kiro-acp` | `~/.pi/agent/extensions/kiro-acp` |

The vendored `test/` directories are source-only and intentionally excluded
from `$HOME`; run their checks from the repository paths above. Chezmoi deploys
runtime extension files as regular files, not Stow symlinks.

Read the matching tree's `README.md` before editing, then apply that target and
run its checks.
