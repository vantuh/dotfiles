# Windows / WSL Setup

## 1. Windows side (do this first)

1. Install **WSL 2** — open PowerShell as admin:
   ```powershell
   wsl --install
   ```
2. Install **Alacritty**:
   ```powershell
   winget install Alacritty.Alacritty
   ```
3. Install **JetBrainsMono Nerd Font** — download from [nerdfonts.com](https://www.nerdfonts.com/font-downloads), extract, select all `.ttf` files → right-click → Install.

## 2. Inside WSL

4. Install **Homebrew** (Linuxbrew):
   ```bash
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   ```
5. Clone and run the installer:
   ```bash
   git clone git@github.com:vantuh/dotfiles.git ~/dotfiles
   cd ~/dotfiles
   ./install.sh
   ```
   The script will:
   - Install `stow` via `apt` if missing
   - Stow common packages (`zsh`, `tmux`, `starship`, `yazi`, `opencode`)
   - Detect WSL and copy `alacritty.toml` to `C:\Users\<YOU>\AppData\Roaming\alacritty\`

6. Install CLI tools:
   ```bash
   brew bundle --file=~/dotfiles/Brewfile
   ```
   > macOS-only casks (`karabiner-elements`, `zed`, `temurin`, `font-symbols-only-nerd-font`, etc.) will be skipped on Linux.

7. Set zsh as default shell:
   ```bash
   chsh -s $(which zsh)
   ```
8. Restart your terminal. Zinit will auto-install all plugins on first launch.

## 3. Post-install tweaks

- Update `working_directory` in `alacritty.toml` if your WSL home differs from the macOS path
- Alacritty is configured to auto-launch a tmux session named `main` — make sure tmux is installed

## Native Windows support

Core tools from this stack (`zsh`, `tmux`, `stow`, `zinit`) have no Windows support. A native setup would require a completely different stack (PowerShell profile, different plugin manager, different paths).

The following tools do work natively on Windows via `winget` or `scoop`:
- Starship (with PowerShell), Alacritty, yazi, fzf, ripgrep, fd, zoxide, lazygit, jq

### Possible future additions

**Windows Terminal config** — a stow package with `settings.json` that sets WSL as default profile with JetBrainsMono Nerd Font and Dracula theme. The `install.sh` WSL section could copy it to `%LOCALAPPDATA%\Packages\Microsoft.WindowsTerminal_8wekyb3d8bbwe\LocalState\settings.json`.

**PowerShell profile** (low priority) — a minimal `$PROFILE` with Starship + zoxide + aliases as a separate `powershell` stow package.

### Recommendation

Stick with WSL. Both Alacritty and Windows Terminal can connect to WSL sessions, giving the full zsh/tmux experience without maintaining a second set of configs.
