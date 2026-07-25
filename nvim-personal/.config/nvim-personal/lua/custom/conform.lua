vim.pack.add({ 'https://github.com/stevearc/conform.nvim' })

require('conform').setup({
  notify_on_error = false,
  format_on_save = function(bufnr)
    local enabled_filetypes = {
      css = true,
      html = true,
      htmlangular = true,
      javascript = true,
      javascriptreact = true,
      json = true,
      jsonc = true,
      less = true,
      lua = true,
      scss = true,
      typescript = true,
      typescriptreact = true,
      yaml = true,
    }
    if enabled_filetypes[vim.bo[bufnr].filetype] then
      return { timeout_ms = 500 }
    end
    return nil
  end,
  default_format_opts = {
    lsp_format = 'fallback',
  },
  formatters_by_ft = {
    css = { 'prettier' },
    html = { 'prettier' },
    htmlangular = { 'prettier' },
    javascript = { 'prettier' },
    javascriptreact = { 'prettier' },
    json = { 'prettier' },
    jsonc = { 'prettier' },
    less = { 'prettier' },
    lua = { 'stylua' },
    scss = { 'prettier' },
    typescript = { 'prettier' },
    typescriptreact = { 'prettier' },
    yaml = { 'prettier' },
  },
})

-- Format lives on <leader>cf (LazyVim-style) so <leader>ff can be "find files"
vim.keymap.set({ 'n', 'v' }, '<leader>cf', function()
  require('conform').format({ async = true })
end, { desc = '[C]ode [F]ormat buffer' })
