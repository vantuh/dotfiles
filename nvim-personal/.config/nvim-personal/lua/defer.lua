-- Minimal event- and VimEnter-based module loader built on Neovim autocmds.
-- Plugin installation and activation remain owned by vim.pack inside each module.

local M = {}

local vim_enter_queue = {}

local function drain_vim_enter_queue()
  local queue = vim_enter_queue
  vim_enter_queue = nil
  for _, fn in ipairs(queue) do
    vim.schedule(fn)
  end
end

vim.api.nvim_create_autocmd('VimEnter', {
  once = true,
  callback = drain_vim_enter_queue,
})

---@param events string|string[]
---@param module string
---@param opts? { pattern?: string|string[] }
function M.on(events, module, opts)
  opts = opts or {}
  local group_name = 'defer-' .. module:gsub('[^%w]', '-')

  vim.api.nvim_create_autocmd(events, {
    group = vim.api.nvim_create_augroup(group_name, { clear = true }),
    pattern = opts.pattern,
    once = true,
    callback = function()
      require(module)
    end,
  })
end

---Run after startup without blocking the first screen.
---@param fn fun()
function M.on_vim_enter(fn)
  if vim_enter_queue then
    table.insert(vim_enter_queue, fn)
  else
    vim.schedule(fn)
  end
end

return M
