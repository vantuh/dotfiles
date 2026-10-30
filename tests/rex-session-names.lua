local handlers, labels, views = {}, {}, {}
rex = {
  on = function(event, fn) handlers[event] = fn end,
  session = {
    view = function() return views.current end,
    set_label = function(args) labels[#labels + 1] = args.label end,
  },
}
dofile("home/dot_config/rex/session-names.lua")
local process, relabel = handlers["terminal.pwd_changed"], handlers.session_label_changed
local function view(label, focused)
  views.current = { label = label, windows = { { focused_block_id = focused } } }
end
local function cd(session, block, cwd)
  process({ session_id = session, block_id = block }, { pwd = "file://host" .. cwd:gsub(" ", "%%20") })
end

view("brave-thicket", "first")
cd("s1", "second", "/src/other")
assert(#labels == 0, "Only the first tab names the session")
cd("s1", "first", "/src/dotfiles/")
assert(labels[1] == "dotfiles")
relabel({ session_id = "s1" }, { label = "dotfiles" })
view("dotfiles", "first")
cd("s1", "first", os.getenv("HOME"))
assert(labels[2] == "~", "Follows the first tab after its own rename")

relabel({ session_id = "s1" }, { label = "my-task" })
view("my-task", "first")
cd("s1", "first", "/src/elsewhere")
assert(#labels == 2, "A label set by someone else is kept")

view("Release notes", "first")
cd("s2", "first", "/src/app")
assert(#labels == 2, "Existing hand-picked labels are kept")
view("quiet-reef", "first")
cd("s3", "first", "/src/my app")
assert(labels[3] == "my app", "Decodes the file URL")
print("Rex session name checks passed")
