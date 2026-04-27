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
# zinit ice pick"async.zsh" src"pure.zsh" # with zsh-async library that's bundled with it.
# zinit light sindresorhus/pure
zinit light spaceship-prompt/spaceship-prompt

SPACESHIP_DIR_TRUNC_REPO=false

SPACESHIP_TIME_SHOW=false
SPACESHIP_USER_SHOW=never
SPACESHIP_DIR_TRUNC_REPO=false

SPACESHIP_AWS_SHOW=true
SPACESHIP_NODE_SHOW=false
# SPACESHIP_AWS_SYMBOL="☁️ "
# SPACESHIP_AWS_COLOR="208"

# Theme end

# tmux
# zinit for \
#     configure'--disable-utf8proc --prefix=$PWD --quiet' \
#     make'PREFIX=$PWD --quiet install'\
#     null \
#     sbin \
#   @tmux/tmux
# tmux end

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
zi snippet OMZP::brew
zi snippet OMZP::npm
zi pack:"default+keys" for fzf

export NVM_COMPLETION=true
export NVM_SYMLINK_CURRENT="true"
export NVM_LAZY_LOAD=true
zinit wait lucid light-mode for lukechilds/zsh-nvm

# bun
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"

# Completion styling start
zstyle ':completion:*' menu select
zstyle ':completion:*' matcher-list 'm:{a-zA-Z}={A-Za-z}'
zstyle ':completion:*' accept-exact 'yes'
zstyle ':completion:*:descriptions' format '%B-- %d --%b'

# Yazi
export EDITOR='code' # for yazi open
function y() {
	local tmp="$(mktemp -t "yazi-cwd.XXXXXX")" cwd
	yazi "$@" --cwd-file="$tmp"
	if cwd="$(command cat -- "$tmp")" && [ -n "$cwd" ] && [ "$cwd" != "$PWD" ]; then
		builtin cd -- "$cwd"
	fi
	rm -f -- "$tmp"
}

autoload -U +X bashcompinit && bashcompinit
complete -o nospace -C /opt/homebrew/bin/terraform terraform

alias tf="terraform"

export PATH="/opt/homebrew/opt/ruby/bin:$PATH"
export PATH="$HOME/.gem/ruby/3.4.0/bin:$PATH"
export PATH="/opt/homebrew/lib/ruby/gems/3.4.0/bin:$PATH"

# bun completions
[ -s "/Users/vantuh/.bun/_bun" ] && source "/Users/vantuh/.bun/_bun"

# bun
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"
export PATH="$HOME/.local/bin:$PATH"

# opencode
export PATH=/Users/vantuh/.opencode/bin:$PATH

# The following lines have been added by Docker Desktop to enable Docker CLI completions.
fpath=(/Users/vantuh/.docker/completions $fpath)
autoload -Uz compinit
compinit
# End of Docker CLI completions

# pnpm
export PNPM_HOME="/Users/vantuh/Library/pnpm"
case ":$PATH:" in
  *":$PNPM_HOME:"*) ;;
  *) export PATH="$PNPM_HOME:$PATH" ;;
esac
# pnpm end
