# Prompt and zinit-managed plugins.

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
