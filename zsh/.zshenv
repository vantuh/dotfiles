# Prevent /etc/zsh/zshrc from calling compinit before we filter fpath in .zshrc
skip_global_compinit=1

# Platform detection
if [[ "$OSTYPE" == "darwin"* ]]; then
  typeset -g DOTFILES_PLATFORM=macos DOTFILES_USER=vantuh
else
  typeset -g DOTFILES_PLATFORM=wsl DOTFILES_USER=Ivan
fi

if [[ -n "${HERDR_ENV:-}" ]]; then
  export PROCESS_LAUNCHED_BY_Q=1
fi

# Environment
export LANG=en_US.UTF-8
export LC_TIME=uk_UA.UTF-8
export EDITOR='nvim'
export VISUAL='nvim'
export GIT_EDITOR='nvim'

# Tool env
export NVM_COMPLETION=true
export NVM_SYMLINK_CURRENT="true"
export NVM_LAZY_LOAD=true
export BUN_INSTALL="$HOME/.bun"

if [[ "$DOTFILES_PLATFORM" == macos ]]; then
  export PNPM_HOME="$HOME/Library/pnpm"
else
  export PNPM_HOME="$HOME/.local/share/pnpm"
fi

  # Homebrew before .zshrc
if [[ "$DOTFILES_PLATFORM" == macos ]]; then
  if [[ -x /opt/homebrew/bin/brew ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  fi
elif [[ "$DOTFILES_PLATFORM" == wsl ]]; then
  if [[ -x /home/linuxbrew/.linuxbrew/bin/brew ]]; then
    eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"
  fi
fi

# PATH: tool bins
export PATH="$HOME/.nvm/current/bin:$PATH"
export PATH="$BUN_INSTALL/bin:$PATH"
export PATH="$HOME/.opencode/bin:$PATH"
export PATH="$HOME/.local/bin:/usr/local/bin:$PATH"
export PATH="$HOME/.nub/bin:$PATH"

case ":$PATH:" in
  *":$PNPM_HOME:"*) ;;
  *) export PATH="$PNPM_HOME:$PATH" ;;
esac
