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

tss() {
  local session
  session=$(tmux list-sessions -F '#S' | fzf) || return

  if [ -n "$TMUX" ]; then
    tmux switch-client -t "$session"
  else
    tmux attach -t "$session"
  fi
}

herdr-setup() {
  local panes current_tab workspace_id
  local lazygit_resp lazygit_pane
  local tests_resp tests_pane

  panes="$(herdr pane list)" || return
  current_tab="$(python3 -c 'import json,sys; ps=json.load(sys.stdin)["result"]["panes"]; print(next(p["tab_id"] for p in ps if p.get("focused")))' <<< "$panes")" || return
  workspace_id="$(python3 -c 'import json,sys; ps=json.load(sys.stdin)["result"]["panes"]; print(next(p["workspace_id"] for p in ps if p.get("focused")))' <<< "$panes")" || return

  herdr tab rename "$current_tab" "Orchestrator" || return

  lazygit_resp="$(herdr tab create --workspace "$workspace_id" --label "lazygit" --no-focus)" || return
  lazygit_pane="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["result"]["root_pane"]["pane_id"])' <<< "$lazygit_resp")" || return
  herdr pane run "$lazygit_pane" "lg" || return

  tests_resp="$(herdr tab create --workspace "$workspace_id" --label "tests" --no-focus)" || return
  tests_pane="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["result"]["root_pane"]["pane_id"])' <<< "$tests_resp")" || return
  herdr pane split "$tests_pane" --direction right --no-focus >/dev/null || return

  herdr tab create --workspace "$workspace_id" --label "run" --no-focus >/dev/null || return

  herdr tab focus "$current_tab"
}
