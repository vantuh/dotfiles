#!/bin/bash
# install.sh — cross-platform dotfiles installer
# Usage:
#   macOS:  cd ~/dotfiles && ./install.sh
#   WSL:    cd ~/dotfiles && ./install.sh

set -e

DOTFILES_DIR="$(cd "$(dirname "$0")" && pwd)"

# --- Detect platform ---
if [[ "$OSTYPE" == "darwin"* ]]; then
  PLATFORM="macos"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
  PLATFORM="linux"
else
  echo "Unsupported platform: $OSTYPE"
  exit 1
fi

echo "Platform: $PLATFORM"
echo "Dotfiles: $DOTFILES_DIR"
echo ""

# --- Check stow ---
if ! command -v stow &>/dev/null; then
  echo "GNU Stow not found. Installing..."
  if [[ "$PLATFORM" == "macos" ]]; then
    brew install stow
  else
    sudo apt update && sudo apt install -y stow
  fi
fi

# --- Handle WSL-specific setup ---
if [[ "$PLATFORM" == "linux" ]] && grep -qi microsoft /proc/version 2>/dev/null; then
  WINDOWS_USER=$(cmd.exe /C "echo %USERNAME%" 2>/dev/null | tr -d '\r')
  ALACRITTY_WIN="/mnt/c/Users/$WINDOWS_USER/AppData/Roaming/alacritty"
  ZED_WIN="/mnt/c/Users/$WINDOWS_USER/AppData/Roaming/Zed"

  if [[ -n "$WINDOWS_USER" ]]; then
    echo "Detected WSL. Setting up Alacritty for Windows..."
    mkdir -p "$ALACRITTY_WIN"
    cp "$DOTFILES_DIR/alacritty/.config/alacritty/base.toml" "$ALACRITTY_WIN/base.toml"
    cp "$DOTFILES_DIR/alacritty/.config/alacritty/windows.toml" "$ALACRITTY_WIN/alacritty.toml"
    echo "  -> Copied base.toml + windows.toml (as alacritty.toml) to $ALACRITTY_WIN"
    echo ""

    echo "Detected WSL. Setting up Zed for Windows..."
    WSL_DISTRO="${WSL_DISTRO_NAME:-Ubuntu}"
    ZED_WSL_CONFIG_PATH="${DOTFILES_DIR#/}/zed/.config/zed"
    ZED_WSL_CONFIG="\\\\wsl.localhost\\$WSL_DISTRO\\${ZED_WSL_CONFIG_PATH//\//\\}"
    POWERSHELL_EXE="powershell.exe"
    if [[ -x "/mnt/c/Users/$WINDOWS_USER/AppData/Local/Microsoft/WindowsApps/pwsh.exe" ]]; then
      POWERSHELL_EXE="/mnt/c/Users/$WINDOWS_USER/AppData/Local/Microsoft/WindowsApps/pwsh.exe"
    elif [[ -x "/mnt/c/Program Files/PowerShell/7/pwsh.exe" ]]; then
      POWERSHELL_EXE="/mnt/c/Program Files/PowerShell/7/pwsh.exe"
    fi
    # Run from WSL, but create Windows symlinks whose targets are WSL UNC paths.
    # This requires Windows Developer Mode or an elevated shell.
    if "$POWERSHELL_EXE" -NoProfile -ExecutionPolicy Bypass -Command '
      $ErrorActionPreference = "Stop"
      $targetDir = "'"$ZED_WSL_CONFIG"'"
      $zedDir = Join-Path $env:APPDATA "Zed"
      New-Item -ItemType Directory -Force -Path $zedDir | Out-Null
      foreach ($name in @("settings.json", "keymap.json")) {
        $link = Join-Path $zedDir $name
        $existing = Get-Item -LiteralPath $link -Force -ErrorAction SilentlyContinue
        if ($existing) {
          Remove-Item -LiteralPath $link -Force
        }
        New-Item -ItemType SymbolicLink -Path $link -Target (Join-Path $targetDir $name) | Out-Null
      }
    '; then
      echo "  -> Symlinked settings.json + keymap.json to $ZED_WIN"
      echo "  -> Target: $ZED_WSL_CONFIG"
      echo "  -> PowerShell: $POWERSHELL_EXE"
    else
      echo "  !! Could not create Windows symlinks. Enable Windows Developer Mode or run from an elevated shell."
      echo "  -> Falling back to regular copied files in $ZED_WIN"
      mkdir -p "$ZED_WIN"
      rm -f "$ZED_WIN/settings.json" "$ZED_WIN/keymap.json"
      cp "$DOTFILES_DIR/zed/.config/zed/settings.json" "$ZED_WIN/settings.json"
      cp "$DOTFILES_DIR/zed/.config/zed/keymap.json" "$ZED_WIN/keymap.json"
    fi
    echo ""
  fi

  echo "Setting up llama-update..."
  mkdir -p "$HOME/.local/bin"
  ln -sf "$DOTFILES_DIR/scripts/llama-update.sh" "$HOME/.local/bin/llama-update"
  echo "  -> Symlinked llama-update to ~/.local/bin/llama-update"
  echo ""
fi

# --- Stow packages ---
COMMON_PACKAGES="zsh tmux starship yazi pi omp"

if [[ "$PLATFORM" == "macos" ]]; then
  PACKAGES="$COMMON_PACKAGES alacritty karabiner zed lazygit"
else
  PACKAGES="$COMMON_PACKAGES"
fi

# Remove absolute extensions symlink that conflicts with stow --no-folding
# (stow sees it as "not owned by stow" and aborts the entire pi/omp package)
for agent_ext in "$HOME/.pi/agent/extensions" "$HOME/.omp/agent/extensions"; do
  if [[ -L "$agent_ext" ]]; then
    rm -f "$agent_ext"
  fi
done

echo "Stowing packages: $PACKAGES"
echo ""

for pkg in $PACKAGES; do
  if [[ -d "$DOTFILES_DIR/$pkg" ]]; then
    echo "  [$pkg] stowing..."
    STOW_OPTS="--restow"
    [[ "$pkg" == "pi" || "$pkg" == "omp" ]] && STOW_OPTS="$STOW_OPTS --no-folding"
    stow -d "$DOTFILES_DIR" -t "$HOME" $STOW_OPTS "$pkg" 2>&1 | { grep -v 'BUG in find_stowed_path' || true; } | sed 's/^/    /'
  else
    echo "  [$pkg] skipped (directory not found)"
  fi
done

# --- Post-stow: Alacritty platform config on macOS ---
if [[ "$PLATFORM" == "macos" ]]; then
  ALACRITTY_CFG="$HOME/.config/alacritty"
  if [[ -d "$ALACRITTY_CFG" ]]; then
    ln -sf "$DOTFILES_DIR/alacritty/.config/alacritty/macos.toml" "$ALACRITTY_CFG/alacritty.toml"
    echo "  [alacritty] -> Symlinked macos.toml as alacritty.toml"
  fi
fi

# --- Link shared agent skills/instructions ---
echo ""
echo "Linking shared agent skills..."

# ~/.agents → shared skills root (npx skills reads/writes here)
ln -sfn "$DOTFILES_DIR/agents/.agents" "$HOME/.agents"
echo "  ~/.agents -> $DOTFILES_DIR/agents/.agents"

# Skills symlinks for each agent
for dir in "$HOME/.pi/agent" "$HOME/.omp/agent" "$HOME/.config/opencode" "$HOME/.claude" "$HOME/.kiro"; do
  mkdir -p "$dir"
  ln -sf "$HOME/.agents/skills" "$dir/skills"
  echo "  $dir/skills -> ~/.agents/skills"
done

# Shared AGENTS.md for each agent
for dir in "$HOME/.pi/agent" "$HOME/.omp/agent" "$HOME/.config/opencode" "$HOME/.kiro"; do
  ln -sf "$HOME/.agents/AGENTS.md" "$dir/AGENTS.md"
  echo "  $dir/AGENTS.md -> ~/.agents/AGENTS.md"
done

# Cleanup: skill tools sometimes create a circular symlink inside the skills dir
# (~/.agents -> dotfiles/agents/.agents, so writes go into the repo)
CIRCULAR_LINK="$DOTFILES_DIR/agents/.agents/skills/skills"
if [[ -L "$CIRCULAR_LINK" ]]; then
  rm -f "$CIRCULAR_LINK"
  echo "  Removed circular skills/skills symlink"
fi

echo ""
echo "Done! Restart your shell or run: source ~/.zshrc"
