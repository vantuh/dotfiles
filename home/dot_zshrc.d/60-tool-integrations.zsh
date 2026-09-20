# Tool integrations loaded for interactive shells.

# fzf — source directly so Ctrl+R works on first prompt
if [[ -f /usr/share/doc/fzf/examples/key-bindings.zsh ]]; then
  _fzf_shell=/usr/share/doc/fzf/examples
elif command -v brew >/dev/null 2>&1; then
  _fzf_shell=$(brew --prefix fzf)/shell
fi
if [[ -n ${_fzf_shell:-} ]]; then
  source $_fzf_shell/key-bindings.zsh 2>/dev/null
  source $_fzf_shell/completion.zsh 2>/dev/null
fi
unset _fzf_shell

# NVM completions
zinit wait lucid light-mode for lukechilds/zsh-nvm

# Bun completions
[ -s "$HOME/.bun/_bun" ] && source "$HOME/.bun/_bun"

eval "$(zoxide init zsh)"
