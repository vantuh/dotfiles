# Platform-specific interactive configuration.
if [[ "$DOTFILES_PLATFORM" == macos ]]; then
  export PATH="/opt/homebrew/opt/ruby/bin:$PATH"
  export PATH="$HOME/.gem/ruby/3.4.0/bin:$PATH"
  export PATH="/opt/homebrew/lib/ruby/gems/3.4.0/bin:$PATH"

  # Docker Desktop completions
  if [[ -d "$HOME/.docker/completions" ]]; then
    fpath=("$HOME/.docker/completions" $fpath)
  fi
else
  export LLAMA_CPP_PATH=~/.local/bin/llama-cpp
  export PLANNOTATOR_BROWSER=explorer.exe
fi
