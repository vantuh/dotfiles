-- Names each session after the working directory of its first tab.
-- 66-rex.zsh runs it with `rex do --all`; rex.on does not work in init.lua.
local generated = "^%l+%-%l+$"
local auto, ours = {}, {}

local function name_for(pwd)
  local path = pwd:gsub("^file://[^/]*", ""):gsub("%%(%x%x)", function(hex)
    return string.char(tonumber(hex, 16))
  end)
  if path == os.getenv("HOME") then
    return "~"
  end
  return path:match("([^/]+)/*$") or path
end

rex.on("session_label_changed", function(ctx, ev)
  -- A label we did not set means a person or an agent chose it: stop renaming.
  if ev.label ~= ours[ctx.session_id] then
    auto[ctx.session_id] = false
  end
end)

rex.on("terminal.pwd_changed", function(ctx, ev)
  local view = rex.session.view{}
  local first = view and view.windows and view.windows[1]
  if not first or first.focused_block_id ~= ctx.block_id then
    return
  end
  local id = ctx.session_id
  if auto[id] == nil then
    -- shortcut: a hand-picked "word-word" label set before this script started looks generated.
    auto[id] = view.label:match(generated) ~= nil
  end
  local name = name_for(ev.pwd)
  if auto[id] and name ~= view.label then
    ours[id] = name
    rex.session.set_label{ label = name }
  end
end)
