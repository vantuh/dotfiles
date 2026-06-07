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

ab-connect() {
  local port_file="/mnt/c/Users/${DOTFILES_USER}/AppData/Local/Google/Chrome/User Data/DevToolsActivePort"
  if [ ! -f "$port_file" ]; then
    echo "Chrome not running with remote debugging. Enable it at chrome://inspect/#remote-debugging" >&2
    return 1
  fi
  local port=$(sed -n '1p' "$port_file")
  local ws_path=$(sed -n '2p' "$port_file")
  agent-browser connect "ws://127.0.0.1:${port}${ws_path}"
}
