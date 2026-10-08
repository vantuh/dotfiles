# Prompt and zinit-managed plugins.

# Prompt — starship (fast, Rust-based, cached init)
if [[ ! -f ~/.cache/starship/init.zsh ]] || [[ ~/.config/starship.toml -nt ~/.cache/starship/init.zsh ]]; then
    mkdir -p ~/.cache/starship
    __starship_posix="$(command -v starship)"
    __starship_win="$(cygpath -w "$__starship_posix" 2>/dev/null)"
    if [[ -n "$__starship_win" && "$__starship_win" == *\\* ]]; then
        starship init zsh | sed "s|${__starship_win//\\/\\\\}|${__starship_posix}|g" > ~/.cache/starship/init.zsh
    else
        starship init zsh > ~/.cache/starship/init.zsh
    fi
    unset __starship_posix __starship_win
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
