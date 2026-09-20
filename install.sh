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

  if [[ -n "$WINDOWS_USER" ]]; then
    echo "Detected WSL. Setting up Windows Terminal..."
    POWERSHELL_EXE="powershell.exe"
    if [[ -x "/mnt/c/Users/$WINDOWS_USER/AppData/Local/Microsoft/WindowsApps/pwsh.exe" ]]; then
      POWERSHELL_EXE="/mnt/c/Users/$WINDOWS_USER/AppData/Local/Microsoft/WindowsApps/pwsh.exe"
    elif [[ -x "/mnt/c/Program Files/PowerShell/7/pwsh.exe" ]]; then
      POWERSHELL_EXE="/mnt/c/Program Files/PowerShell/7/pwsh.exe"
    fi
    WT_PACKAGES_DIR="/mnt/c/Users/$WINDOWS_USER/AppData/Local/Packages"
    WT_LOCAL_STATE=$(find "$WT_PACKAGES_DIR" -maxdepth 2 -name "LocalState" -path "*WindowsTerminal*" 2>/dev/null | head -1)
    if [[ -n "$WT_LOCAL_STATE" ]]; then
      WSL_DISTRO="${WSL_DISTRO_NAME:-Ubuntu}"
      WT_SRC_PATH="${DOTFILES_DIR#/}/windows-terminal/settings.json"
      WT_WSL_PATH="\\\\wsl.localhost\\$WSL_DISTRO\\${WT_SRC_PATH//\//\\}"
      WT_LINK=$(wslpath -w "$WT_LOCAL_STATE")\\settings.json
      if "$POWERSHELL_EXE" -NoProfile -ExecutionPolicy Bypass -Command "
        \$link = '$WT_LINK'
        \$target = '$WT_WSL_PATH'
        \$existing = Get-Item -LiteralPath \$link -Force -ErrorAction SilentlyContinue
        if (\$existing) { Remove-Item -LiteralPath \$link -Force }
        New-Item -ItemType SymbolicLink -Path \$link -Target \$target | Out-Null
      "; then
        echo "  -> Symlinked Windows Terminal settings.json"
      else
        cp "$DOTFILES_DIR/windows-terminal/settings.json" "$WT_LOCAL_STATE/settings.json"
        echo "  -> Copied Windows Terminal settings.json (symlink failed)"
      fi
    else
      echo "  !! Windows Terminal not found, skipping"
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
COMMON_PACKAGES="zsh starship yazi pi herdr hunk nvim omp"

if [[ "$PLATFORM" == "macos" ]]; then
  PACKAGES="$COMMON_PACKAGES karabiner ghostty"
else
  PACKAGES="$COMMON_PACKAGES"
fi

# Remove absolute extensions symlink that conflicts with stow --no-folding
# (stow sees it as "not owned by stow" and aborts the entire package)
for agent_ext in "$HOME/.pi/agent/extensions" "$HOME/.omp/agent/extensions"; do
  if [[ -L "$agent_ext" ]]; then
    rm -f "$agent_ext"
  fi
done

# Remove stale nvim-personal symlink: the personal config is now the default
# `nvim` config inside the merged `nvim` package (LazyVim lives at `lazyvim`).
if [[ -L "$HOME/.config/nvim-personal" ]]; then
  rm -f "$HOME/.config/nvim-personal"
fi

echo "Stowing packages: $PACKAGES"
echo ""

# Remove files that block stow
rm -f "$HOME/.zcompdump" "$HOME/.zcompdump".*

# Migrate the legacy auto-generated pi-autoname config now tracked by dotfiles.
# Preserve any local version instead of letting it abort the entire pi package.
PI_AUTONAME_CONFIG="$HOME/.pi/agent/pi-autoname.json"
if [[ -e "$PI_AUTONAME_CONFIG" && ! -L "$PI_AUTONAME_CONFIG" ]]; then
  PI_AUTONAME_BACKUP="$PI_AUTONAME_CONFIG.pre-stow.$(date +%Y%m%d-%H%M%S)"
  mv "$PI_AUTONAME_CONFIG" "$PI_AUTONAME_BACKUP"
  echo "  [pi] Backed up legacy pi-autoname config to $PI_AUTONAME_BACKUP"
fi

# Migrate the live omp-generated config now tracked by dotfiles. Preserve the
# local version instead of letting it abort the entire omp package.
OMP_CONFIG="$HOME/.omp/agent/config.yml"
if [[ -e "$OMP_CONFIG" && ! -L "$OMP_CONFIG" ]]; then
  OMP_CONFIG_BACKUP="$OMP_CONFIG.pre-stow.$(date +%Y%m%d-%H%M%S)"
  mv "$OMP_CONFIG" "$OMP_CONFIG_BACKUP"
  echo "  [omp] Backed up live omp config to $OMP_CONFIG_BACKUP"
fi

# Same for kiro-acp.json: a regular file here blocks restow of the tracked
# config. Backup, don't delete.
OMP_KIRO_JSON="$HOME/.omp/agent/kiro-acp.json"
if [[ -e "$OMP_KIRO_JSON" && ! -L "$OMP_KIRO_JSON" ]]; then
  OMP_KIRO_JSON_BACKUP="$OMP_KIRO_JSON.pre-stow.$(date +%Y%m%d-%H%M%S)"
  mv "$OMP_KIRO_JSON" "$OMP_KIRO_JSON_BACKUP"
  echo "  [omp] Backed up live kiro-acp.json to $OMP_KIRO_JSON_BACKUP"
fi

# ~/.omp is a live runtime tree. Stow --no-folding only owns tracked files;
# ignore lock/node_modules below. Copied kiro-acp files (regular files, not
# links) are a one-time conflict — delete ~/.omp/agent/extensions/kiro-acp
# yourself, then restow. The installer must not rm HOME copies.

for pkg in $PACKAGES; do
  if [[ -d "$DOTFILES_DIR/$pkg" ]]; then
    echo "  [$pkg] stowing..."
    stow_args=(--restow)
    if [[ "$pkg" == "pi" || "$pkg" == "herdr" || "$pkg" == "omp" ]]; then
      stow_args+=(--no-folding --ignore='(cursor-sdk\.json|node_modules|package(-lock)?\.json|\.lock)$')
    fi
    stow -d "$DOTFILES_DIR" -t "$HOME" "${stow_args[@]}" "$pkg" 2>&1 | { grep -v 'BUG in find_stowed_path' || true; } | sed 's/^/    /'
  else
    echo "  [$pkg] skipped (directory not found)"
  fi
done

# --- lazygit config symlink ---
LAZYGIT_SRC="$DOTFILES_DIR/lazygit/config.yml"
if [[ "$PLATFORM" == "macos" ]]; then
  LAZYGIT_DST="$HOME/Library/Application Support/lazygit/config.yml"
else
  LAZYGIT_DST="$HOME/.config/lazygit/config.yml"
fi
mkdir -p "$(dirname "$LAZYGIT_DST")"
ln -sf "$LAZYGIT_SRC" "$LAZYGIT_DST"
echo "  [lazygit] -> $LAZYGIT_DST"

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

# Cleanup: skill tools sometimes create a circular symlink inside the skills dir
# (~/.agents -> dotfiles/agents/.agents, so writes go into the repo)
CIRCULAR_LINK="$DOTFILES_DIR/agents/.agents/skills/skills"
if [[ -L "$CIRCULAR_LINK" ]]; then
  rm -f "$CIRCULAR_LINK"
  echo "  Removed circular skills/skills symlink"
fi

echo ""
echo "Done! Restart your shell or run: source ~/.zshrc"

# --- Herdr plugins ---
HERDR_PLUGINS_DIR="$DOTFILES_DIR/herdr/plugins"
if [[ -d "$HERDR_PLUGINS_DIR" ]] && command -v herdr &>/dev/null; then
  echo ""
  echo "Linking Herdr plugins..."
  for plugin_dir in "$HERDR_PLUGINS_DIR"/*; do
    [[ -d "$plugin_dir" ]] || continue
    plugin_name="$(basename "$plugin_dir")"
    if herdr plugin link "$plugin_dir" >/dev/null 2>&1; then
      echo "  $plugin_name -> $plugin_dir"
    else
      echo "  $plugin_name skipped (link failed; run: herdr plugin link $plugin_dir)"
    fi
  done
fi
