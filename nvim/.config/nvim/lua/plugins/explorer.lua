local previews = setmetatable({}, { __mode = "k" })
local preview_icons_ns = vim.api.nvim_create_namespace("snacks_explorer_preview_icons")

local function hide_preview(picker)
  local preview = previews[picker]
  if preview and preview.win then
    preview.win:destroy()
    preview.win = nil
    preview.path = nil
  end
end

local function close_preview(picker)
  local preview = previews[picker]
  hide_preview(picker)
  if preview and preview.augroup then
    pcall(vim.api.nvim_del_augroup_by_id, preview.augroup)
  end
  previews[picker] = nil
end

local function add_file(picker)
  hide_preview(picker)
  require("snacks.explorer.actions").actions.explorer_add(picker)
end

local function directory_lines(path)
  local entries = {}
  local truncated = false
  local ok = pcall(function()
    for name, kind in vim.fs.dir(path) do
      if #entries == 500 then
        truncated = true
        break
      end
      entries[#entries + 1] = { name = name, kind = kind }
    end
  end)
  if not ok then
    return { "Unable to read directory: " .. path }
  end

  table.sort(entries, function(a, b)
    if (a.kind == "directory") ~= (b.kind == "directory") then
      return a.kind == "directory"
    end
    return a.name:lower() < b.name:lower()
  end)

  local lines = {}
  local highlights = {}
  for _, entry in ipairs(entries) do
    local directory = entry.kind == "directory"
    local icon, hl = Snacks.util.icon(entry.name, directory and "directory" or "file")
    lines[#lines + 1] = icon .. "  " .. entry.name .. (directory and "/" or "")
    highlights[#highlights + 1] = { line = #lines - 1, end_col = #icon, hl = hl }
  end
  if truncated then
    lines[#lines + 1] = "… more entries omitted"
  end
  return #lines > 0 and lines or { "(empty directory)" }, highlights
end

local function preview_lines(path)
  local stat = vim.uv.fs_stat(path)
  if not stat then
    return { "File not found: " .. path }
  end
  if stat.type == "directory" then
    return directory_lines(path)
  end
  if stat.size > 1024 * 1024 then
    return { "File is too large to preview (> 1 MB)" }
  end

  local file = io.open(path, "rb")
  local sample = file and file:read(1024)
  if file then
    file:close()
  end
  if sample and sample:find("\0", 1, true) then
    return { "Binary file preview is not supported" }
  end

  local ok, lines = pcall(vim.fn.readfile, path, "", 10000)
  if not ok then
    return { "Unable to read: " .. path }
  end
  if #lines == 10000 then
    lines[#lines + 1] = "… preview truncated after 10,000 lines"
  end
  return #lines > 0 and lines or { "" }
end

local function update_preview(picker, item)
  if not picker:is_focused() or not (item and item.file) then
    return
  end

  local preview = previews[picker]
  if not preview then
    preview = {
      augroup = vim.api.nvim_create_augroup("snacks_explorer_float_preview_" .. picker.id, { clear = true }),
    }
    previews[picker] = preview

    vim.api.nvim_create_autocmd("WinEnter", {
      group = preview.augroup,
      callback = function()
        if picker.closed then
          close_preview(picker)
        elseif picker:is_focused() then
          preview.path = nil
          update_preview(picker, picker:current())
        else
          hide_preview(picker)
        end
      end,
    })
  end

  local path = Snacks.picker.util.path(item)
  local valid = preview.win and preview.win:valid()
  if not path or (preview.path == path and valid) then
    return
  end
  preview.path = path

  if not valid then
    preview.win = Snacks.win({
      relative = "win",
      win = picker.main,
      width = 0.7,
      height = 0.7,
      border = "rounded",
      title_pos = "center",
      backdrop = {
        blend = 60,
        win = {
          relative = "win",
          win = picker.main,
          width = 0,
          height = 0,
        },
      },
      enter = false,
      focusable = false,
      minimal = false,
      zindex = 40,
      wo = {
        cursorline = false,
        number = true,
        relativenumber = false,
        signcolumn = "no",
        wrap = false,
      },
    })
  end

  local buf = preview.win.buf
  local lines, icon_highlights = preview_lines(path)
  vim.bo[buf].modifiable = true
  vim.api.nvim_buf_set_lines(buf, 0, -1, false, lines)
  vim.bo[buf].modifiable = false
  vim.api.nvim_buf_clear_namespace(buf, preview_icons_ns, 0, -1)
  for _, icon in ipairs(icon_highlights or {}) do
    vim.api.nvim_buf_set_extmark(buf, preview_icons_ns, icon.line, 0, {
      end_col = icon.end_col,
      hl_group = icon.hl,
    })
  end
  vim.bo[buf].filetype = vim.filetype.match({ filename = path }) or ""
  preview.win:set_title(vim.fn.fnamemodify(path, ":t"))
  vim.api.nvim_win_set_cursor(preview.win.win, { 1, 0 })
end

return {
  {
    "folke/snacks.nvim",
    opts = {
      picker = {
        sources = {
          explorer = {
            hidden = true, -- show dotfiles (e.g. .config)
            ignored = false, -- keep gitignored hidden (.DS_Store, .env, …)
            layout = {
              preset = "sidebar",
              preview = false,
            },
            actions = {
              add_file = add_file,
            },
            on_change = update_preview,
            on_close = close_preview,
            win = {
              list = {
                keys = {
                  ["a"] = "add_file",
                  ["P"] = false,
                },
              },
            },
          },
          -- Space Space / <leader>ff
          files = {
            hidden = true,
            ignored = false,
            matcher = {
              frecency = true,
              sort_empty = true,
            },
          },
        },
      },
    },
  },
}
