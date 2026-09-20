# ~/.zshrc — interactive shell loader

# Secrets/tokens are local-only and intentionally not committed.
[ -f ~/.tokens ] && source ~/.tokens

_zshrc_dir="${ZDOTDIR:-$HOME}/.zshrc.d"

if [[ -d "$_zshrc_dir" ]]; then
  for _zshrc_file in "$_zshrc_dir"/*.zsh(N); do
    [[ -n "$ZSHRC_TRACE" ]] && print -r -- "loading $_zshrc_file"
    source "$_zshrc_file"
  done
fi

unset _zshrc_dir _zshrc_file
