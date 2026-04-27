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

# --- Packages to install ---
COMMON_PACKAGES="zsh tmux starship yazi opencode"

if [[ "$PLATFORM" == "macos" ]]; then
  PACKAGES="$COMMON_PACKAGES alacritty karabiner zed"
else
  PACKAGES="$COMMON_PACKAGES"
fi

# --- Handle Alacritty on Windows (native, not WSL) ---
if [[ "$PLATFORM" == "linux" ]] && grep -qi microsoft /proc/version 2>/dev/null; then
  WINDOWS_USER=$(cmd.exe /C "echo %USERNAME%" 2>/dev/null | tr -d '\r')
  ALACRITTY_WIN="/mnt/c/Users/$WINDOWS_USER/AppData/Roaming/alacritty"

  if [[ -n "$WINDOWS_USER" ]]; then
    echo "Detected WSL. Setting up Alacritty for Windows..."
    mkdir -p "$ALACRITTY_WIN"
    cp "$DOTFILES_DIR/alacritty/.config/alacritty/alacritty.toml" "$ALACRITTY_WIN/alacritty.toml"
    echo "  -> Copied alacritty.toml to $ALACRITTY_WIN"
    echo ""
  fi
fi

# --- Stow packages ---
echo "Stowing packages: $PACKAGES"
echo ""

for pkg in $PACKAGES; do
  if [[ -d "$DOTFILES_DIR/$pkg" ]]; then
    echo "  [$pkg] stowing..."
    stow -d "$DOTFILES_DIR" -t "$HOME" --restow "$pkg" 2>&1 | sed 's/^/    /'
  else
    echo "  [$pkg] skipped (directory not found)"
  fi
done

echo ""
echo "Done! Restart your shell or run: source ~/.zshrc"
