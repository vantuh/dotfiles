-- Physical keys preserve the Herdr shortcuts across English and Ukrainian layouts.
rex.bind("ctrl+[KeyA]>[KeyS]", "session.switch")
rex.bind("ctrl+[KeyA]>shift+[KeyN]", "session.new")
rex.bind("ctrl+[KeyA]>[KeyC]", "client.tab.new")
rex.bind("ctrl+[KeyA]>[Comma]", "client.tab.rename")
rex.bind("ctrl+[KeyA]>shift+[Backslash]", "pane.split", { direction = "right" })
rex.bind("ctrl+[KeyA]>[Minus]", "pane.split", { direction = "down" })
rex.bind("ctrl+[KeyA]>[KeyX]", "pane.close")
rex.bind("ctrl+[KeyA]>[KeyZ]", "pane.zoom")
rex.bind("ctrl+[KeyA]>[KeyB]", "client.sidebar.toggle")
rex.bind("ctrl+[KeyA]>[KeyG]", "lazygit")
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

local terminal = "com.superlogical.terminal"

-- Rex only sees each terminal's root process (login), so walk the process tree.
local function find_lazygit_block(view)
  local ps = rex.exec({ "ps", "-axo", "pid=,ppid=,comm=" })
  if not ps or not ps.ok then
    return nil
  end
  local parent, lazygit = {}, {}
  for pid, ppid, comm in ps.stdout:gmatch("(%d+)%s+(%d+)%s+([^\n]+)") do
    parent[pid] = ppid
    if comm:match("lazygit$") then
      lazygit[#lazygit + 1] = pid
    end
  end
  if #lazygit == 0 then
    return nil
  end
  for _, window in ipairs(view.windows or {}) do
    for _, layer in ipairs(window.layers or {}) do
      for _, block in ipairs(layer.blocks or {}) do
        local process = rex.block.call(terminal, "process", { block_id = block.block_id })
        local root = process and process.child and tostring(process.child.pid)
        for _, pid in ipairs(lazygit) do
          while pid and pid ~= root do
            pid = parent[pid]
          end
          if pid then
            return block.block_id
          end
        end
      end
    end
  end
end

rex.action{
  name = "lazygit",
  title = "Open Lazygit",
  run = function(ctx)
    local view, err = rex.session.view{}
    if not view then
      error(err, 0)
    end
    local open = find_lazygit_block(view)
    if open then
      rex.session.focus_block{ block_id = open }
      return
    end
    local reported = rex.block.call(terminal, "pwd", { block_id = ctx.block_id })
    local cwd = reported and reported.pwd and reported.pwd:gsub("^file://[^/]*", ""):gsub("%%(%x%x)", function(hex)
      return string.char(tonumber(hex, 16))
    end)
    local _, failure = rex.session.new_window{
      window_label = "lazygit",
      layout = rex.layout.block{
        flavor = terminal .. ".shell",
        options = { command = { "lazygit" }, cwd = cwd },
      },
    }
    if failure then
      error(failure, 0)
    end
  end,
}

for index = 1, 9 do
  rex.bind("alt+[Digit" .. index .. "]", "client.tab.goto", { index = index })
  rex.bind("ctrl+shift+[Digit" .. index .. "]", "select_session_by_index", { index = index })
end
