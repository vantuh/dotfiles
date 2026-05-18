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

  if [[ -n "$WINDOWS_USER" ]]; then
    echo "Detected WSL. Setting up Alacritty for Windows..."
    mkdir -p "$ALACRITTY_WIN"
    cp "$DOTFILES_DIR/alacritty/.config/alacritty/base.toml" "$ALACRITTY_WIN/base.toml"
    cp "$DOTFILES_DIR/alacritty/.config/alacritty/windows.toml" "$ALACRITTY_WIN/alacritty.toml"
    echo "  -> Copied base.toml + windows.toml (as alacritty.toml) to $ALACRITTY_WIN"
    echo ""
  fi

  echo "Setting up llama-update..."
  mkdir -p "$HOME/.local/bin"
  ln -sf "$DOTFILES_DIR/scripts/llama-update.sh" "$HOME/.local/bin/llama-update"
  echo "  -> Symlinked llama-update to ~/.local/bin/llama-update"
  echo ""
fi

# --- Stow packages ---
COMMON_PACKAGES="zsh tmux starship yazi opencode pi"

if [[ "$PLATFORM" == "macos" ]]; then
  PACKAGES="$COMMON_PACKAGES alacritty karabiner zed"
else
  PACKAGES="$COMMON_PACKAGES"
fi

echo "Stowing packages: $PACKAGES"
echo ""

for pkg in $PACKAGES; do
  if [[ -d "$DOTFILES_DIR/$pkg" ]]; then
    echo "  [$pkg] stowing..."
    STOW_OPTS="--restow"
    [[ "$pkg" == "pi" ]] && STOW_OPTS="$STOW_OPTS --no-folding"
    stow -d "$DOTFILES_DIR" -t "$HOME" $STOW_OPTS "$pkg" 2>&1 | sed 's/^/    /'
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
for dir in "$HOME/.pi/agent" "$HOME/.config/opencode" "$HOME/.claude" "$HOME/.kiro"; do
  mkdir -p "$dir"
  ln -sf "$HOME/.agents/skills" "$dir/skills"
  echo "  $dir/skills -> ~/.agents/skills"
done

# Shared AGENTS.md for each agent
for dir in "$HOME/.pi/agent" "$HOME/.config/opencode" "$HOME/.kiro"; do
  ln -sf "$HOME/.agents/AGENTS.md" "$dir/AGENTS.md"
  echo "  $dir/AGENTS.md -> ~/.agents/AGENTS.md"
done

echo ""
echo "Done! Restart your shell or run: source ~/.zshrc"
