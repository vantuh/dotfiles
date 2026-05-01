# dotfiles

Cross-platform dotfiles (macOS + Windows/WSL) managed with [GNU Stow](https://www.gnu.org/software/stow/).

## Packages

| Package    | Contents                          | macOS | WSL |
|------------|-----------------------------------|:-----:|:---:|
| alacritty  | Alacritty terminal config         | ✓     | ✓*  |
| zsh        | Zsh config with Zinit plugins     | ✓     | ✓   |
| tmux       | Tmux config                       | ✓     | ✓   |
| starship   | Starship prompt theme             | ✓     | ✓   |
| yazi       | Yazi file manager config          | ✓     | ✓   |
| opencode   | OpenCode config + TUI theme       | ✓     | ✓   |
| pi         | Pi coding agent config            | ✓     | ✓   |
| agents     | Shared AI agent skills & instructions (symlinked to Pi, OpenCode, Kiro) | ✓ | ✓ |
| karabiner  | Karabiner-Elements key remapping  | ✓     |     |
| zed        | Zed editor settings + keymap      | ✓     |     |

\* On WSL, `alacritty.toml` is copied to the Windows-native config path instead of symlinked.

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

The `install.sh` script auto-detects the platform (macOS / WSL) and stows the appropriate packages. On WSL it also copies `alacritty.toml` to the Windows-native config path.

Restart your terminal after install. Zinit will auto-install all plugins on first launch.

For Windows/WSL-specific setup steps, see [docs/windows.md](docs/windows.md).

## Shared Agent Skills

The `agents/` directory is the single source of truth for AI agent skills and instructions shared across multiple agents (Pi, OpenCode, Kiro). Instead of duplicating skills in each agent's config, `install.sh` runs `agents/link.sh` which creates symlinks from each agent's expected location to the canonical source.

```
agents/
  skills/           # shared SKILL.md files
  instructions/      # shared instruction files
  links.json         # manifest: skill → [target paths]
  link.sh            # creates symlinks from links.json
  skills.json        # GitHub sources for skill updates
  update-skills.sh   # fetch latest skills from GitHub
```

To add a new shared skill, place it in `agents/skills/<name>/SKILL.md` and add target paths to `agents/links.json`.

To update skills from GitHub sources: `./agents/update-skills.sh`

## Uninstall

```bash
cd ~/dotfiles
stow -D zsh tmux starship yazi opencode alacritty karabiner zed
```

## Manual stow usage

```bash
# Apply a single package
stow -d ~/dotfiles -t ~ --restow <package>

# Remove a single package
stow -d ~/dotfiles -t ~ -D <package>
```
