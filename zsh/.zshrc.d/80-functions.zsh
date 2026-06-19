# Interactive shell functions.

# Yazi
function y() {
	local tmp="$(mktemp -t "yazi-cwd.XXXXXX")" cwd
	yazi "$@" --cwd-file="$tmp"
	if cwd="$(command cat -- "$tmp")" && [ -n "$cwd" ] && [ "$cwd" != "$PWD" ]; then
		builtin cd -- "$cwd"
	fi
	rm -f -- "$tmp"
}

llama-swap-start() {
  cd ~/dotfiles
  llama-swap --config ./scripts/llama-run/llama-swap.yaml --listen localhost:8080
}

dotfix() {
  cd ~/dotfiles
  git pull
  bash ./install.sh
}
