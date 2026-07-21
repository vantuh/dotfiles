local function expanded_typescript_hover()
  local hover = require("ts_expand_hover")
  local state = hover.get_state()

  hover.hover()
  local generation = state.generation
  local attempts = 0

  local function expand_once()
    if state.generation ~= generation then
      return
    end

    if state.float_bufnr and vim.api.nvim_buf_is_valid(state.float_bufnr) then
      for _, mapping in ipairs(vim.api.nvim_buf_get_keymap(state.float_bufnr, "n")) do
        if mapping.lhs == "+" and mapping.callback then
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

return {
  {
    "neovim/nvim-lspconfig",
    opts = {
      inlay_hints = { enabled = false },
      servers = {
        vtsls = {
          keys = {
            {
              "K",
              expanded_typescript_hover,
              desc = "TypeScript Expandable Hover",
            },
          },
        },
      },
    },
  },
  {
    "nemanjamalesija/ts-expand-hover.nvim",
    ft = { "typescript", "typescriptreact" },
    opts = {
      keymaps = { hover = false },
    },
  },
}
