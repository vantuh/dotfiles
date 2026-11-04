local bindings, actions, queued, writes = {}, {}, {}, {}
local response, failure
local clip, bracketed = "pasted text", true
local windows, calls, processes = {}, {}, "  100     1 login\n  101   100 -zsh\n  300     1 login\n  301   300 lazygit\n"
rex = {
  bind = function(key, action, args)
    assert(not bindings[key], "Duplicate binding: " .. key)
    bindings[key] = { action = action, args = args }
  end,
  action = function(action) actions[action.name] = action end,
  call = function(method)
    assert(method == "session.list")
    return response, failure
  end,
  session = {
    view = function() return { windows = windows } end,
    focus_block = function(args) calls[#calls + 1] = { "focus", args } end,
    new_window = function(args)
      calls[#calls + 1] = { "new", args }
      return {}
    end,
  },
  block = {
    call = function(_, method, args)
      if method == "pwd" then
        return { pwd = "file://host/src/my%20repo" }
      end
      if method == "modes" then
        return { modes = { { name = "bracketed_paste", set = bracketed } } }
      end
      if method == "write" then
        writes[#writes + 1] = args.data
        return {}
      end
      return { child = { pid = args.block_id == "git-pane" and 200 or 100 } }
    end,
  },
  exec = function(argv)
    if argv[1] == "pbpaste" then
      return { ok = true, stdout = clip }
    end
    return { ok = true, stdout = processes }
  end,
  layout = { block = function(block) return block end },
  client = {
    queue = function(action, args)
      queued[#queued + 1] = { action = action, args = args }
    end,
  },
}
dofile("home/dot_config/rex/init.lua")

assert(bindings["ctrl+[KeyA]>shift+[KeyN]"].action == "session.new")
assert(bindings["ctrl+[KeyA]>shift+[Backslash]"].args.direction == "right")
assert(bindings["ctrl+[KeyA]>[Minus]"].args.direction == "down")
assert(bindings["ctrl+[KeyA]>ctrl+[KeyA]"].args.key == "ctrl+a")
assert(bindings["shift+enter"].args.data == string.char(27) .. "[13;2u")
assert(not bindings["j"] and not bindings["k"] and not bindings["up"] and not bindings["down"])
for index = 1, 9 do
  assert(bindings["alt+[Digit" .. index .. "]"].args.index == index)
  local binding = bindings["ctrl+shift+[Digit" .. index .. "]"]
  assert(binding.action == "select_session_by_index" and binding.args.index == index)
end

local select_session = actions.select_session_by_index.run
response = { sessions = { { session_id = "second" }, { session_id = "first" } } }
select_session({}, { index = 2 })
assert(#queued == 1 and queued[1].action == "session.select")
assert(queued[1].args.session_id == "first", "Must preserve server order, not sort IDs")
select_session({}, { index = 9 })
response = {}
select_session({}, { index = 1 })
assert(#queued == 1, "Missing sessions must not change the selection")
response, failure = nil, "server unavailable"
local ok, err = pcall(select_session, {}, { index = 1 })
assert(not ok and err:find(failure, 1, true))
assert(#queued == 1, "Failed lookups must not queue a selection")
assert(bindings["ctrl+[KeyA]>[KeyG]"].action == "lazygit")
local lazygit = actions.lazygit.run
lazygit({ block_id = "current" })
local new = calls[1][2]
assert(calls[1][1] == "new" and new.window_label == "lazygit")
assert(new.layout.options.cwd == "/src/my repo" and new.layout.options.command[1] == "lazygit")
local function pane(id) return { layers = { { blocks = { { block_id = id } } } } } end
windows = { pane("shell"), pane("git-pane") }
lazygit({ block_id = "current" })
assert(calls[2][1] == "new", "A lazygit outside the session does not count")
processes = processes .. "  200     1 login\n  201   200 -zsh\n  202   201 /opt/homebrew/bin/lazygit\n"
lazygit({ block_id = "current" })
assert(#calls == 3 and calls[3][1] == "focus" and calls[3][2].block_id == "git-pane", "Reuses lazygit started in any pane")
local paste = bindings["ctrl+shift+[KeyV]"]
assert(type(paste.action) == "function", "Ctrl+Shift+V must run a function")
assert(paste.action({ block_id = "current" }) == true)
assert(writes[1] == "\27[200~pasted text\27[201~", "Bracketed paste must wrap the clipboard")
bracketed = false
paste.action({ block_id = "current" })
assert(writes[2] == "pasted text", "Terminals without bracketed paste get the raw clip")
clip = ""
paste.action({ block_id = "current" })
assert(#writes == 2, "An empty clipboard must write nothing")
print("Rex shortcut checks passed")
