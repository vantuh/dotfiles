vim.pack.add({ "https://github.com/folke/persistence.nvim" })

-- sessionoptions owned by core/options.lua
local persistence = require("persistence")
persistence.setup({})

--- Close Snacks UI windows (explorer/picker) so sessions don't restore empty sidebars.
local function close_snacks_windows()
  local wins = vim.api.nvim_list_wins()
  for _, win in ipairs(wins) do
    if vim.api.nvim_win_is_valid(win) and #vim.api.nvim_list_wins() > 1 then
      local buf = vim.api.nvim_win_get_buf(win)
      local ft = vim.bo[buf].filetype
      if vim.startswith(ft, "snacks_") then
        pcall(vim.api.nvim_win_close, win, true)
      end
    end
  end
end

--- Drop leftover empty unnamed windows left behind by an old explorer restore.
local function close_empty_sidebar_placeholders()
  local wins = vim.api.nvim_list_wins()
  for _, win in ipairs(wins) do
    if vim.api.nvim_win_is_valid(win) and #vim.api.nvim_list_wins() > 1 then
      local buf = vim.api.nvim_win_get_buf(win)
      local name = vim.api.nvim_buf_get_name(buf)
      local ft = vim.bo[buf].filetype
      local bt = vim.bo[buf].buftype
      if vim.startswith(ft, "snacks_")
        or (name == "" and bt == "" and ft == "" and not vim.bo[buf].modified)
      then
        pcall(vim.api.nvim_win_close, win, true)
      end
    end
  end
end

--- :mksession fails with E32 when the current buffer has no name.
local function focus_named_buffer()
  if vim.api.nvim_buf_get_name(0) ~= "" and vim.bo.buftype == "" then
    return
  end
  for _, buf in ipairs(vim.api.nvim_list_bufs()) do
    if vim.api.nvim_buf_is_valid(buf)
      and vim.api.nvim_buf_is_loaded(buf)
      and vim.bo[buf].buflisted
      and vim.bo[buf].buftype == ""
      and vim.api.nvim_buf_get_name(buf) ~= ""
    then
      vim.api.nvim_set_current_buf(buf)
      return
    end
  end
end

vim.api.nvim_create_autocmd("User", {
  pattern = "PersistenceSavePre",
  callback = function()
    close_snacks_windows()
    close_empty_sidebar_placeholders()
    focus_named_buffer()
  end,
})

vim.api.nvim_create_autocmd("User", {
  pattern = "PersistenceLoadPost",
  callback = function()
    vim.schedule(close_empty_sidebar_placeholders)
  end,
})

-- Safety net: never let a bad mksession abort quit with E32.
local orig_save = persistence.save
persistence.save = function()
  focus_named_buffer()
  local ok, err = pcall(orig_save)
  if not ok then
    vim.notify("Session save skipped: " .. tostring(err), vim.log.levels.WARN)
  end
end

vim.api.nvim_create_autocmd("VimEnter", {
  desc = "Restore the session for the current directory",
  once = true,
  nested = true,
  callback = function()
    if vim.fn.argc() == 0 and vim.api.nvim_buf_get_name(0) == "" and vim.bo[0].buftype == "" then
      persistence.load()
    end
  end,
})

vim.keymap.set("n", "<leader>qs", function()
  persistence.load()
end, { desc = "Restore Session" })

vim.keymap.set("n", "<leader>qS", function()
  persistence.select()
end, { desc = "Select Session" })

vim.keymap.set("n", "<leader>ql", function()
  persistence.load({ last = true })
end, { desc = "Restore Last Session" })

vim.keymap.set("n", "<leader>qd", function()
  persistence.stop()
end, { desc = "Do Not Save Session" })
