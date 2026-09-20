# Clear screen and scrollback (mirrors tmux C-k binding)
_clear_scrollback() { printf '\033[3J'; zle clear-screen; }
zle -N _clear_scrollback
bindkey '^K' _clear_scrollback
