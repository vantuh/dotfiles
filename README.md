# dotfiles

Cross-platform dotfiles (macOS + Windows) managed with [GNU Stow](https://www.gnu.org/software/stow/).

## Packages

| Package    | Contents                          |
|------------|-----------------------------------|
| alacritty  | Alacritty terminal config         |
| zsh        | Zsh config with Zinit plugins     |
| tmux       | Tmux config                       |
| opencode   | OpenCode config + TUI theme       |
| yazi       | Yazi file manager config          |
| starship   | Starship prompt theme             |

## Usage (macOS/Linux)

```bash
git clone git@github.com:vantuh/dotfiles.git ~/dotfiles
cd ~/dotfiles
stow alacritty zsh tmux opencode yazi starship
```

To remove symlinks:
```bash
stow -D alacritty zsh tmux opencode yazi starship
```

## Usage (Windows)

Run symlinks manually or use `install.ps1` (TODO).
