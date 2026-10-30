local bindings, actions, queued = {}, {}, {}
local response, failure
local windows, calls = {}, {}
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
    focus_window = function(args) calls[#calls + 1] = { "focus", args } end,
    new_window = function(args)
      calls[#calls + 1] = { "new", args }
      return {}
    end,
  },
  block = { call = function() return { pwd = "file://host/src/my%20repo" } end },
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
windows = { { window_id = "shell", label = "shell" }, { window_id = "git", label = "lazygit" } }
lazygit({ block_id = "current" })
assert(#calls == 2 and calls[2][1] == "focus" and calls[2][2].window_id == "git", "Reuses the open lazygit tab")
print("Rex shortcut checks passed")
