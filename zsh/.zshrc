if [[ "$OSTYPE" == "darwin"* ]]; then
  typeset -g DOTFILES_PLATFORM=macos DOTFILES_USER=vantuh
else
  typeset -g DOTFILES_PLATFORM=wsl DOTFILES_USER=Ivan
fi

# Homebrew + /usr/local/bin first — avoid slow /usr/bin/git shim on macOS
if [[ "$DOTFILES_PLATFORM" == macos ]]; then
  export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
elif [[ "$DOTFILES_PLATFORM" == wsl ]] && [[ -f /home/linuxbrew/.linuxbrew/bin/brew ]]; then
  eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"
fi

# WSL: strip slow Windows paths (9P filesystem), keep only useful ones
if [[ "$DOTFILES_PLATFORM" == wsl ]]; then
  path=( ${path:#/mnt/c/*} )
  path+=(
    "/mnt/c/Users/${DOTFILES_USER}/AppData/Local/Programs/Microsoft VS Code/bin"
    "/mnt/c/Program Files/Docker/Docker/resources/bin"
    "/mnt/c/WINDOWS"
    "/mnt/c/WINDOWS/System32/WindowsPowerShell/v1.0"
  )
fi

[ -f ~/.tokens ] && source ~/.tokens

export POWERLINE_NERD_FONTS=1

if [[ "$DOTFILES_PLATFORM" != macos ]] && command -v keychain &>/dev/null; then
  eval "$(keychain --eval --quiet github 2>/dev/null)"
fi

fpath=(${^fpath}(N))

# User configuration
export LANG=en_US.UTF-8
export LC_TIME=uk_UA.UTF-8

# History
HISTSIZE=10000
HISTFILE=~/.zsh_history
SAVEHIST=$HISTSIZE
HISTDUP=erase
setopt APPEND_HISTORY
setopt HIST_IGNORE_DUPS
setopt HIST_IGNORE_ALL_DUPS
setopt HIST_FIND_NO_DUPS
setopt HIST_SAVE_NO_DUPS
setopt HIST_IGNORE_SPACE
setopt INC_APPEND_HISTORY
setopt SHARE_HISTORY

# Aliases
alias ncu="npx npm-check-updates -i"
alias lg="lazygit"
alias ld="lazydocker"
alias tf="terraform"
alias dotfix="cd ~/dotfiles && bash ./install.sh"

# Brew wrapper — auto-sync Brewfile on install/uninstall
function brew() {
  command brew "$@"
  if [[ "$1" == "install" || "$1" == "uninstall" || "$1" == "remove" ]]; then
    command brew bundle dump --force --file=~/dotfiles/Brewfile
  fi
}

### Zinit installer
if [[ ! -f $HOME/.local/share/zinit/zinit.git/zinit.zsh ]]; then
    print -P "%F{33} %F{220}Installing %F{33}ZDHARMA-CONTINUUM%F{220} Initiative Plugin Manager (%F{33}zdharma-continuum/zinit%F{220})…%f"
    command mkdir -p "$HOME/.local/share/zinit" && command chmod g-rwX "$HOME/.local/share/zinit"
    command git clone https://github.com/zdharma-continuum/zinit "$HOME/.local/share/zinit/zinit.git" && \
        print -P "%F{33} %F{34}Installation successful.%f%b" || \
        print -P "%F{160} The clone has failed.%f%b"
fi

source "$HOME/.local/share/zinit/zinit.git/zinit.zsh"
autoload -Uz _zinit
(( ${+_comps} )) && _comps[zinit]=_zinit

# Auto-update zinit + plugins (weekly, background)
ZINIT_UPDATE_FILE="$HOME/.zinit-last-update"
if [[ ! -f "$ZINIT_UPDATE_FILE" ]] || (( $(date +%s) - $(cat "$ZINIT_UPDATE_FILE") > 604800 )); then
  { zinit self-update; zinit update --all; date +%s > "$ZINIT_UPDATE_FILE" } &>/dev/null &!
fi

# Annexes (turbo)
zinit wait lucid light-mode for \
    zdharma-continuum/zinit-annex-bin-gem-node \
    zdharma-continuum/zinit-annex-patch-dl

# Prompt — starship (fast, Rust-based, cached init)
if [[ ! -f ~/.cache/starship/init.zsh ]] || [[ ~/.config/starship.toml -nt ~/.cache/starship/init.zsh ]]; then
    mkdir -p ~/.cache/starship
    starship init zsh > ~/.cache/starship/init.zsh
fi
source ~/.cache/starship/init.zsh

# OMZ snippets (turbo)
zinit wait lucid for \
    OMZL::functions.zsh \
    OMZL::clipboard.zsh \
    OMZL::termsupport.zsh \
    OMZP::git \
    OMZP::npm \
    OMZP::brew

# Syntax highlighting, autosuggestions, completions (turbo)
zinit wait lucid for \
  atinit"ZINIT[COMPINIT_OPTS]=-C; zicompinit; zicdreplay" \
    zdharma-continuum/fast-syntax-highlighting \
  blockf \
    zsh-users/zsh-completions \
  atload"!_zsh_autosuggest_start" \
    zsh-users/zsh-autosuggestions

# Tools via zinit (turbo)
zinit ice wait lucid from"gh-r" as"program" mv"jq-* -> jq"
zinit light jqlang/jq

zinit ice wait lucid from"gh-r" as"program"
zinit light jesseduffield/lazygit

# fzf — load after turbo plugins so key-bindings aren't lost during zicdreplay
zinit ice wait'0b' lucid atload'_dotfiles_fzf_bindkeys'
zinit lucid for \
  https://raw.githubusercontent.com/junegunn/fzf/master/shell/key-bindings.zsh \
  https://raw.githubusercontent.com/junegunn/fzf/master/shell/completion.zsh

# NVM (lazy)
export NVM_COMPLETION=true
export NVM_SYMLINK_CURRENT="true"
export NVM_LAZY_LOAD=true
zinit wait lucid light-mode for lukechilds/zsh-nvm
export PATH="$HOME/.nvm/current/bin:$PATH"

# bun
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"
[ -s "$HOME/.bun/_bun" ] && source "$HOME/.bun/_bun"

# Completion styling
zstyle ':completion:*' menu select
zstyle ':completion:*' matcher-list 'm:{a-zA-Z}={A-Za-z}'
zstyle ':completion:*' accept-exact 'yes'
zstyle ':completion:*:descriptions' format '%B-- %d --%b'

# Yazi
export EDITOR='code'
function y() {
	local tmp="$(mktemp -t "yazi-cwd.XXXXXX")" cwd
	yazi "$@" --cwd-file="$tmp"
	if cwd="$(command cat -- "$tmp")" && [ -n "$cwd" ] && [ "$cwd" != "$PWD" ]; then
		builtin cd -- "$cwd"
	fi
	rm -f -- "$tmp"
}

# opencode
export PATH="$HOME/.opencode/bin:$PATH"
export PATH="$HOME/.local/bin:$PATH"

# --- Platform-specific ---
if [[ "$DOTFILES_PLATFORM" == macos ]]; then
  export PATH="/opt/homebrew/opt/ruby/bin:$PATH"
  export PATH="$HOME/.gem/ruby/3.4.0/bin:$PATH"
  export PATH="/opt/homebrew/lib/ruby/gems/3.4.0/bin:$PATH"

  # Docker Desktop completions
  if [[ -d "$HOME/.docker/completions" ]]; then
    fpath=("$HOME/.docker/completions" $fpath)
  fi

  export PNPM_HOME="$HOME/Library/pnpm"
else
  export PNPM_HOME="$HOME/.local/share/pnpm"
  export LLAMA_CPP_PATH=~/.local/bin/llama-cpp
  export PLANNOTATOR_BROWSER=explorer.exe
fi

# pnpm PATH
case ":$PATH:" in
  *":$PNPM_HOME:"*) ;;
  *) export PATH="$PNPM_HOME:$PATH" ;;
esac

eval "$(zoxide init zsh)"

export PLANNOTATOR_SHARE=disabled
export PILENS_DATA_DIR=~/.pi-lens/projects

# fzf Ctrl+R / Ctrl+T — re-apply after async zinit loads (and if fzf was missing at first parse)
_dotfiles_fzf_bindkeys() {
  command -v fzf &>/dev/null || return 1
  (( ${+functions[fzf-history-widget]} )) || return 1
  bindkey -M emacs '^R' fzf-history-widget
  bindkey -M viins '^R' fzf-history-widget
  bindkey -M vicmd '^R' fzf-history-widget
  (( ${+functions[fzf-file-widget]} )) && bindkey -M emacs '^T' fzf-file-widget
}
_dotfiles_fzf_bindkeys
