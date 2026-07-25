-- Minimal event-based module loader built on Neovim autocmds.
-- Plugin installation and activation remain owned by vim.pack inside each module.

local M = {}

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

return M
