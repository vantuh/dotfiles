# dotfiles

Cross-platform dotfiles (macOS + WSL) managed with [GNU Stow](https://www.gnu.org/software/stow/).

## Packages

### Stow packages (symlinked to `$HOME`)

| Package   | Contents                          | macOS | WSL |
| --------- | --------------------------------- | :---: | :-: |
| zsh       | Zsh config with Zinit plugins     |   ✓   |  ✓  |
| tmux      | Tmux config                       |   ✓   |  ✓  |
| starship  | Starship prompt theme             |   ✓   |  ✓  |
| yazi      | Yazi file manager config          |   ✓   |  ✓  |
| pi        | Pi coding agent config            |   ✓   |  ✓  |
| alacritty | Alacritty terminal config         |   ✓   | ✓\* |
| karabiner | Karabiner-Elements key remapping  |   ✓   |     |
| zed       | Zed editor settings + keymap      |   ✓   |     |

\* On WSL, `alacritty.toml` is copied to the Windows-native config path instead of symlinked.

### Other packages (manually symlinked by `install.sh`)

| Package     | Contents                                         |
| ----------- | ------------------------------------------------ |
| agents      | Shared AI agent skills & instructions            |
| lazygit     | Lazygit config                                   |
| scripts     | Utility scripts (llama runner, pi commit helper) |
| fan_control | Fan Control app config (Linux/Windows)           |

## Prerequisites

- [Homebrew](https://brew.sh/) (macOS) or [Linuxbrew](https://docs.brew.sh/Homebrew-on-Linux) (WSL)
- [JetBrainsMono Nerd Font](https://www.nerdfonts.com/font-downloads)
- Git

## Installation

```bash
git clone git@github.com:vantuh/dotfiles.git ~/dotfiles
cd ~/dotfiles
./install.sh
brew bundle
chsh -s $(which zsh)
```

`install.sh` auto-detects the platform (macOS / WSL), stows the appropriate packages, symlinks lazygit config, and wires up shared agent skills. On WSL it also copies `alacritty.toml` to the Windows-native config path.

Restart your terminal after install. Zinit will auto-install all plugins on first launch.

## Shared Agent Skills

The `agents/` directory is the single source of truth for AI agent skills and instructions shared across Pi, OMP, OpenCode, Kiro, and Claude.

```
agents/
  .agents/          # symlinked to ~/.agents (shared skills root)
    AGENTS.md       # shared agent instructions
    skills/         # shared SKILL.md files
  .pi/
    skills/         # pi-specific skill symlinks
  skills-lock.json  # pinned skill versions
```

`install.sh` creates `~/.agents → dotfiles/agents/.agents`, then symlinks each agent's `skills/` and `AGENTS.md` into `~/.agents`. This means skill writes from any agent flow back into the repo automatically.

To add a shared skill: place it in `agents/.agents/skills/<name>/SKILL.md` and add symlinks for each target agent in `install.sh`.

## Uninstall

```bash
cd ~/dotfiles
stow -D zsh tmux starship yazi pi alacritty karabiner zed
```

## Manual stow usage

```bash
# Apply a single package
stow -d ~/dotfiles -t ~ --restow <package>

# Remove a single package
stow -d ~/dotfiles -t ~ -D <package>
```
