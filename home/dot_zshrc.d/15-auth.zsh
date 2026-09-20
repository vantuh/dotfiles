# Authentication helpers.
if [[ "$DOTFILES_PLATFORM" != macos ]] && command -v keychain &>/dev/null; then
  eval "$(keychain --eval --quiet github 2>/dev/null)"
fi
