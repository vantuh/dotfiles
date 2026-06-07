# Prevent /etc/zsh/zshrc from calling compinit before we filter fpath in .zshrc
skip_global_compinit=1

# Platform detection
if [[ "$OSTYPE" == "darwin"* ]]; then
  typeset -g DOTFILES_PLATFORM=macos DOTFILES_USER=vantuh
else
  typeset -g DOTFILES_PLATFORM=wsl DOTFILES_USER=Ivan
fi

# Homebrew + /usr/local/bin first
if [[ "$DOTFILES_PLATFORM" == macos ]]; then
  export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
elif [[ "$DOTFILES_PLATFORM" == wsl ]]; then
  export HOMEBREW_PREFIX="/home/linuxbrew/.linuxbrew"
  export HOMEBREW_CELLAR="/home/linuxbrew/.linuxbrew/Cellar"
  export HOMEBREW_REPOSITORY="/home/linuxbrew/.linuxbrew/Homebrew"
  export PATH="/home/linuxbrew/.linuxbrew/bin:/home/linuxbrew/.linuxbrew/sbin:$PATH"
  export MANPATH="/home/linuxbrew/.linuxbrew/share/man${MANPATH+:$MANPATH}:"
  export INFOPATH="/home/linuxbrew/.linuxbrew/share/info${INFOPATH+:$INFOPATH}"
fi

# Environment
export LANG=en_US.UTF-8
export LC_TIME=uk_UA.UTF-8
export EDITOR='zed'

# NVM
export NVM_COMPLETION=true
export NVM_SYMLINK_CURRENT="true"
export NVM_LAZY_LOAD=true
export PATH="$HOME/.nvm/current/bin:$PATH"

# Bun
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"

# Opencode
export PATH="$HOME/.opencode/bin:$PATH"
export PATH="$HOME/.local/bin:$PATH"

# Platform-specific vars
if [[ "$DOTFILES_PLATFORM" == macos ]]; then
  export PNPM_HOME="$HOME/Library/pnpm"
else
  export PNPM_HOME="$HOME/.local/share/pnpm"
fi

# PNPM PATH
case ":$PATH:" in
  *":$PNPM_HOME:"*) ;;
  *) export PATH="$PNPM_HOME:$PATH" ;;
esac
