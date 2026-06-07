# Tool integrations loaded for interactive shells.

# fzf — source directly so Ctrl+R works on first prompt
_fzf_shell=${FZF_BASE:-~/.local/share/zinit/plugins/fzf}/shell
[[ -f /usr/share/doc/fzf/examples/key-bindings.zsh ]] && _fzf_shell=/usr/share/doc/fzf/examples
source $_fzf_shell/key-bindings.zsh 2>/dev/null
source $_fzf_shell/completion.zsh 2>/dev/null
unset _fzf_shell

# NVM completions
zinit wait lucid light-mode for lukechilds/zsh-nvm

# Bun completions
[ -s "$HOME/.bun/_bun" ] && source "$HOME/.bun/_bun"

eval "$(zoxide init zsh)"
