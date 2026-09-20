# dotfiles

Cross-platform dotfiles (macOS + WSL) managed with [GNU Stow](https://www.gnu.org/software/stow/).

## Packages

### Stow packages (symlinked to `$HOME`)

| Package   | Contents                          | macOS | WSL |
| --------- | --------------------------------- | :---: | :-: |
| zsh       | Zsh config with Zinit plugins     |   ✓   |  ✓  |
| starship  | Starship prompt theme             |   ✓   |  ✓  |
| yazi      | Yazi file manager config          |   ✓   |  ✓  |
| pi        | Pi coding agent config            |   ✓   |  ✓  |
| herdr     | Herdr config + plugins            |   ✓   |  ✓  |
| hunk      | Hunk diff-review config           |   ✓   |  ✓  |
| omp       | Oh My Pi coding agent config      |   ✓   |  ✓  |
| karabiner | Karabiner-Elements key remapping  |   ✓   |     |
| ghostty   | Ghostty terminal configuration    |   ✓   |     |
| nvim      | Neovim: personal config (default) + LazyVim (appname `lazyvim`) | ✓ | ✓ |

### Other directories (not stow packages)

| Directory        | Contents                                                        |
| ---------------- | --------------------------------------------------------------- |
| agents           | Shared AI agent skills & instructions (linked by `install.sh`)  |
| lazygit          | Lazygit config (linked by `install.sh`)                         |
| scripts          | Utility scripts (llama runner, pi commit helper, herdr helpers) |
| fan_control      | Fan Control app config + research docs                          |
| windows-terminal | Windows Terminal `settings.json` (WSL: linked/copied by `install.sh`) |
| openspec         | OpenSpec design docs (specs + archived changes)                 |
| archive          | Retired tmux and Alacritty configs (not installed)             |

## Prerequisites

- [Homebrew](https://brew.sh/) (macOS) or [Linuxbrew](https://docs.brew.sh/Homebrew-on-Linux) (WSL)
- [JetBrainsMono Nerd Font](https://www.nerdfonts.com/font-downloads)
- Git

## Installation

```bash
git clone git@github.com:vantuh/dotfiles.git ~/dotfiles
cd ~/dotfiles
./install.sh
chsh -s $(which zsh)
```

`install.sh` auto-detects the platform (macOS / WSL), stows the appropriate packages, symlinks lazygit config, and wires up shared agent skills. On WSL it also links Windows Terminal settings.

Restart your terminal after install. Zinit will auto-install all plugins on first launch.

## Shared Agent Skills

The `agents/` directory is the single source of truth for AI agent skills and instructions shared across Pi, OpenCode, Kiro, and Claude.

```
agents/
  .agents/          # symlinked to ~/.agents (shared skills root)
    AGENTS.md       # shared agent instructions
    skills/         # shared SKILL.md files
  skills-lock.json  # pinned skill versions
```

`install.sh` creates `~/.agents → dotfiles/agents/.agents`, then symlinks `~/.agents/skills` and `~/.agents/AGENTS.md` into each agent's directory. This means skill writes from any agent flow back into the repo automatically.

To add a shared skill: place it in `agents/.agents/skills/<name>/SKILL.md` — it becomes available to all linked agents automatically.

## Retired Pi extensions

Extensions written for personal use and later retired live in
`pi/.pi/agent/archive/` (not loaded by Pi): `herdr-agents`, the `herdr-peers`
stub, `herdr-tab-name.ts`, and `zz-composer-herdr-agent.ts`. The subagent setup
migrated to the community-maintained
[pi-subagents](https://github.com/nicobailon/pi-subagents) and
[pi-intercom](https://github.com/nicobailon/pi-intercom). See
`pi/.pi/agent/archive/README.md` for the history and restore instructions.

## Two kiro-acp trees

`kiro-acp` is vendored separately for each host. They forked from the same
extension and are not kept in sync.

| Host | Repo path | Loaded from |
| ---- | --------- | ----------- |
| Oh My Pi (`omp`) | `omp/.omp/agent/extensions/kiro-acp` | `~/.omp/agent/extensions/kiro-acp` |
| Pi (`pi`) | `pi/.pi/agent/extensions/kiro-acp` | `~/.pi/agent/extensions/kiro-acp` |

Each tree has a `README.md` with config paths and namespaced runtime files.
Start there before editing. `stow --restow` the matching package (`omp` or
`pi`) after adding files; `--no-folding` links per file, not the directory.

## Uninstall

```bash
cd ~/dotfiles
stow -D zsh starship yazi pi omp herdr hunk karabiner ghostty nvim
```

## Manual stow usage

```bash
# Apply a single package
stow -d ~/dotfiles -t ~ --restow <package>

# Remove a single package
stow -d ~/dotfiles -t ~ -D <package>
```

