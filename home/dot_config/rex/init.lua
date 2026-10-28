-- Physical keys preserve the Herdr shortcuts across English and Ukrainian layouts.
rex.bind("ctrl+[KeyA]>[KeyS]", "session.switch")
rex.bind("ctrl+[KeyA]>[KeyC]", "client.tab.new")
rex.bind("ctrl+[KeyA]>[Comma]", "client.tab.rename")
rex.bind("ctrl+[KeyA]>shift+[Backslash]", "pane.split", { direction = "right" })
rex.bind("ctrl+[KeyA]>[Minus]", "pane.split", { direction = "down" })
rex.bind("ctrl+[KeyA]>[KeyX]", "pane.close")
rex.bind("ctrl+[KeyA]>[KeyZ]", "pane.zoom")
rex.bind("ctrl+[KeyA]>[KeyB]", "client.sidebar.toggle")
rex.bind("ctrl+[KeyA]>ctrl+[KeyA]", "pane.send_key", { key = "ctrl+a" })

rex.bind("shift+left", "client.tab.previous")
rex.bind("shift+right", "client.tab.next")
rex.bind("alt+left", "pane.focus", { direction = "left" })
rex.bind("alt+right", "pane.focus", { direction = "right" })
rex.bind("alt+up", "pane.focus", { direction = "up" })
rex.bind("alt+down", "pane.focus", { direction = "down" })
rex.bind("shift+enter", "com.superlogical.terminal.write", { data = "\27[13;2u" })

rex.action{
  name = "select_session_by_index",
  title = "Select Session by Index",
  args = { index = "integer" },
  run = function(_, args)
    local result, err = rex.call("session.list")
    if not result then
      error(err)
    end
    -- session.list follows the server's session order, including manual reordering.
    local session = (result.sessions or {})[args.index]
    if session then
      rex.client.queue("session.select", { session_id = session.session_id })
    end
  end,
}

for index = 1, 9 do
  rex.bind("alt+[Digit" .. index .. "]", "client.tab.goto", { index = index })
  rex.bind("ctrl+shift+[Digit" .. index .. "]", "select_session_by_index", { index = index })
end
