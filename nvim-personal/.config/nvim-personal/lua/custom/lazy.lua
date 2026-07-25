-- Minimal event- and VimEnter-based module loader built on Neovim autocmds.
-- Plugin installation and activation remain owned by vim.pack inside each module.

local M = {}

local vim_enter_queue = {}

local function drain_vim_enter_queue()
  for _, entry in ipairs(vim_enter_queue) do
    if not entry.sync then vim.schedule(entry.fn) end
  end
  for _, entry in ipairs(vim_enter_queue) do
    if entry.sync then entry.fn() end
  end
  vim_enter_queue = nil
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
  local group_name = 'custom-lazy-' .. module:gsub('[^%w]', '-')

  vim.api.nvim_create_autocmd(events, {
    group = vim.api.nvim_create_augroup(group_name, { clear = true }),
    pattern = opts.pattern,
    once = true,
    callback = function() require(module) end,
  })
end

---Run after startup. Async callbacks are scheduled after synchronous UI setup.
---@param fn fun()
---@param opts? { sync?: boolean }
function M.on_vim_enter(fn, opts)
  local sync = opts and opts.sync or false
  if vim_enter_queue then
    table.insert(vim_enter_queue, { fn = fn, sync = sync })
  elseif sync then
    fn()
  else
    vim.schedule(fn)
  end
end

return M
