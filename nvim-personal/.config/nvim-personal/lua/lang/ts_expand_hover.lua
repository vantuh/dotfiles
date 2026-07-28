-- Expandable TypeScript hover (same habit as LazyVim lsp.lua).
-- Press K → hover float, then auto-expand one verbosity level (+).

vim.pack.add { 'https://github.com/nemanjamalesija/ts-expand-hover.nvim' }

require('ts_expand_hover').setup {
  keymaps = { hover = false },
}

local function expanded_typescript_hover()
  local hover = require 'ts_expand_hover'
  local state = hover.get_state()

  hover.hover()
  local generation = state.generation
  local attempts = 0

  local function expand_once()
    if state.generation ~= generation then
      return
    end

    if state.float_bufnr and vim.api.nvim_buf_is_valid(state.float_bufnr) then
      for _, mapping in ipairs(vim.api.nvim_buf_get_keymap(state.float_bufnr, 'n')) do
        if mapping.lhs == '+' and mapping.callback then
          mapping.callback()
          return
        end
      end
    end

    attempts = attempts + 1
    if attempts < 50 then
      vim.defer_fn(expand_once, 20)
    end
  end

  vim.defer_fn(expand_once, 20)
end

vim.api.nvim_create_autocmd('LspAttach', {
  group = vim.api.nvim_create_augroup('custom-ts-expand-hover', { clear = true }),
  callback = function(event)
    local client = vim.lsp.get_client_by_id(event.data.client_id)
    if not client or client.name ~= 'vtsls' then
      return
    end

    vim.keymap.set('n', 'K', expanded_typescript_hover, {
      buffer = event.buf,
      desc = 'TypeScript Expandable Hover',
    })
  end,
})
