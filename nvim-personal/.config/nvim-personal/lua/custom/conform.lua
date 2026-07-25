vim.pack.add({ 'https://github.com/stevearc/conform.nvim' })

require('conform').setup({
  notify_on_error = false,
  format_on_save = function(bufnr)
    if vim.g.autoformat == false or vim.b[bufnr].autoformat == false then return nil end

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
      mysql = true,
      plsql = true,
      scss = true,
      sql = true,
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
  formatters = {
    sqlfluff = {
      args = { 'format', '--dialect=ansi', '-' },
    },
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
    mysql = { 'sqlfluff' },
    plsql = { 'sqlfluff' },
    scss = { 'prettier' },
    sql = { 'sqlfluff' },
    typescript = { 'prettier' },
    typescriptreact = { 'prettier' },
    yaml = { 'prettier' },
  },
})

-- Format lives on <leader>cf (LazyVim-style) so <leader>ff can be "find files"
vim.keymap.set({ 'n', 'v' }, '<leader>cf', function()
  require('conform').format({ async = true })
end, { desc = '[C]ode [F]ormat buffer' })

vim.keymap.set('n', '<leader>uf', function()
  vim.g.autoformat = not vim.g.autoformat
  vim.notify('Auto format: ' .. (vim.g.autoformat and 'enabled' or 'disabled'))
end, { desc = 'Toggle auto format' })

vim.keymap.set('n', '<leader>uF', function()
  local enabled = vim.b.autoformat ~= false
  vim.b.autoformat = not enabled
  vim.notify('Buffer auto format: ' .. (vim.b.autoformat and 'enabled' or 'disabled'))
end, { desc = 'Toggle buffer auto format' })
