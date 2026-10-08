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

# zoxide: on Windows spawning the binary costs ~17 ms, so cache its init output
# and regenerate only when the binary itself changes.
if [[ "$DOTFILES_PLATFORM" == windows ]]; then
  _zoxide_bin="$(command -v zoxide)"
  if [[ -n $_zoxide_bin ]]; then
    if [[ ! -f ~/.cache/zoxide/init.zsh ]] || [[ $_zoxide_bin -nt ~/.cache/zoxide/init.zsh ]]; then
      mkdir -p ~/.cache/zoxide
      zoxide init zsh > ~/.cache/zoxide/init.zsh
    fi
    source ~/.cache/zoxide/init.zsh
  fi
  unset _zoxide_bin
else
  eval "$(zoxide init zsh)"
fi
