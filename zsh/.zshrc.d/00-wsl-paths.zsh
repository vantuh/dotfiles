# Load order: first.
# WSL: strip slow Windows paths (9P filesystem), keep only useful ones.
if [[ "$DOTFILES_PLATFORM" == wsl ]]; then
  path=( ${path:#/mnt/c/*} )
  path+=(
    "/mnt/c/Users/${DOTFILES_USER}/AppData/Local/Programs/Microsoft VS Code/bin"
    "/mnt/c/Program Files/Docker/Docker/resources/bin"
    "/mnt/c/WINDOWS"
    "/mnt/c/WINDOWS/System32/WindowsPowerShell/v1.0"
  )
fi
