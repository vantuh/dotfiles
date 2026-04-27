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
