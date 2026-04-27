[ -f ~/.tokens ] && source ~/.tokens

# Oh-my-zsh installation path.
export ZSH="$HOME/.oh-my-zsh"

# Oh my zsh auto-update (in days).
zstyle ':omz:update' frequency 7
zstyle 'zinit self-update' frequency 7
zstyle 'zinit update' frequency 7

source $ZSH/oh-my-zsh.sh

# User configuration
export LANG=en_US.UTF-8

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
alias c="cursor"
alias ncu="npx npm-check-updates -i"

alias zshconfig="c ~/.zshrc"
alias ohmyzsh="c ~/.oh-my-zsh"
alias lg="lazygit"
alias lgit="lazygit"
alias ldocker="lazydocker"
alias tf="terraform"

### Added by Zinit's installer
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

# Load a few important annexes, without Turbo
# (this is currently required for annexes)
zinit light-mode for \
    zdharma-continuum/zinit-annex-as-monitor \
    zdharma-continuum/zinit-annex-bin-gem-node \
    zdharma-continuum/zinit-annex-patch-dl \
    zdharma-continuum/zinit-annex-rust
### End of Zinit's installer chunk

# Theme start
zinit light spaceship-prompt/spaceship-prompt

SPACESHIP_TIME_SHOW=false
SPACESHIP_USER_SHOW=never
SPACESHIP_DIR_TRUNC_REPO=false

SPACESHIP_AWS_SHOW=true
SPACESHIP_NODE_SHOW=false
# Theme end

zi snippet OMZ::lib/clipboard.zsh
zi snippet OMZ::lib/termsupport.zsh

# Zinit syntax-highlighting, autosuggestions, completions
zinit wait lucid for \
 atinit"ZINIT[COMPINIT_OPTS]=-C; zicompinit; zicdreplay" \
    zdharma-continuum/fast-syntax-highlighting \
 blockf \
    zsh-users/zsh-completions \
 atload"!_zsh_autosuggest_start" \
    zsh-users/zsh-autosuggestions

# Zinit jq installation
zi for \
    from'gh-r' \
    sbin'* -> jq' \
    nocompile \
  @stedolan/jq

# LazyGit
zi for \
    from'gh-r' \
    sbin'**/lazygit' \
  jesseduffield/lazygit

# Other packages
zi snippet 'https://github.com/agkozak/zsh-z/blob/master/zsh-z.plugin.zsh'
zi snippet OMZP::git
zi snippet OMZP::npm
zi pack:"default+keys" for fzf

# brew plugin (macOS only)
if [[ "$OSTYPE" == "darwin"* ]]; then
  zi snippet OMZP::brew
fi

export NVM_COMPLETION=true
export NVM_SYMLINK_CURRENT="true"
export NVM_LAZY_LOAD=true
zinit wait lucid light-mode for lukechilds/zsh-nvm

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
if [[ "$OSTYPE" == "darwin"* ]]; then
  # Homebrew
  export PATH="/opt/homebrew/opt/ruby/bin:$PATH"
  export PATH="$HOME/.gem/ruby/3.4.0/bin:$PATH"
  export PATH="/opt/homebrew/lib/ruby/gems/3.4.0/bin:$PATH"

  # Terraform (homebrew)
  autoload -U +X bashcompinit && bashcompinit
  complete -o nospace -C /opt/homebrew/bin/terraform terraform

  # Docker Desktop completions
  if [[ -d "$HOME/.docker/completions" ]]; then
    fpath=("$HOME/.docker/completions" $fpath)
    autoload -Uz compinit
    compinit
  fi

  # pnpm (macOS path)
  export PNPM_HOME="$HOME/Library/pnpm"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
  # Terraform (linux)
  if command -v terraform &>/dev/null; then
    autoload -U +X bashcompinit && bashcompinit
    complete -o nospace -C "$(which terraform)" terraform
  fi

  # pnpm (linux path)
  export PNPM_HOME="$HOME/.local/share/pnpm"
fi

# pnpm PATH
case ":$PATH:" in
  *":$PNPM_HOME:"*) ;;
  *) export PATH="$PNPM_HOME:$PATH" ;;
esac
