# Keybindings and completion styling.

# Word navigation (Ctrl-arrows)
bindkey '^[[1;5D' backward-word
bindkey '^[[1;5C' forward-word

# Completion styling
zstyle ':completion:*' menu select
zstyle ':completion:*' matcher-list 'm:{a-zA-Z}={A-Za-z}'
zstyle ':completion:*' accept-exact 'yes'
zstyle ':completion:*:descriptions' format '%B-- %d --%b'
