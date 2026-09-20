vim.pack.add { 'https://github.com/stevearc/conform.nvim' }

-- Single source of truth: which formatters run for each filetype.
-- Two lookup sets are derived from this table below:
--   format_on_save_ft — every ft here formats on save
--   prettier_ft       — fts where prettier is a known parser, so we can skip
--                        the `prettier --file-info` shell probe
local formatters_by_ft = {
  css = { 'prettier' },
  graphql = { 'prettier' },
  handlebars = { 'prettier' },
  html = { 'prettier' },
  htmlangular = { 'prettier' },
  javascript = { 'prettier', 'oxfmt', stop_after_first = true },
  javascriptreact = { 'prettier', 'oxfmt', stop_after_first = true },
  json = { 'prettier' },
  jsonc = { 'prettier' },
  less = { 'prettier' },
  lua = { 'stylua' },
  markdown = { 'prettier', 'markdownlint-cli2', 'markdown-toc' },
  ['markdown.mdx'] = { 'prettier', 'markdownlint-cli2', 'markdown-toc' },
  mysql = { 'sqlfluff' },
  plsql = { 'sqlfluff' },
  scss = { 'prettier' },
  sql = { 'sqlfluff' },
  sh = { 'shfmt' },
  fish = { 'fish_indent' },
  typescript = { 'prettier', 'oxfmt', stop_after_first = true },
  typescriptreact = { 'prettier', 'oxfmt', stop_after_first = true },
  vue = { 'prettier' },
  yaml = { 'prettier' },
}

local format_on_save_ft = {}
local prettier_ft = {}
for ft, formatters in pairs(formatters_by_ft) do
  format_on_save_ft[ft] = true
  if vim.tbl_contains(formatters, 'prettier') then
    prettier_ft[ft] = true
  end
end

-- Prettier condition (adapted from LazyVim extras/formatting/prettier.lua)
---@alias ConformCtx {buf: number, filename: string, dirname: string}
local prettier = {}

-- Same executable as Conform formatting (project-local node_modules/.bin, then PATH).
---@param ctx ConformCtx
function prettier.command(ctx)
  local config = require('conform').get_formatter_config('prettier', ctx.buf)
  if not config then
    return 'prettier'
  end
  local command = config.command
  if type(command) == 'function' then
    command = command(config, ctx)
  end
  return command or 'prettier'
end

---@param ctx ConformCtx
function prettier.has_config(ctx)
  vim.fn.system { prettier.command(ctx), '--find-config-path', ctx.filename }
  return vim.v.shell_error == 0
end

---@param ctx ConformCtx
function prettier.has_parser(ctx)
  local ft = vim.bo[ctx.buf].filetype
  if prettier_ft[ft] then
    return true
  end
  local ret = vim.fn.system { prettier.command(ctx), '--file-info', ctx.filename }
  local ok, parser = pcall(function()
    return vim.fn.json_decode(ret).inferredParser
  end)
  return ok and parser and parser ~= vim.NIL
end

require('conform').setup {
  notify_on_error = false,
  format_on_save = function(bufnr)
    if vim.g.autoformat == false or vim.b[bufnr].autoformat == false then
      return nil
    end

    if format_on_save_ft[vim.bo[bufnr].filetype] then
      return { timeout_ms = 3000 }
    end
    return nil
  end,
  default_format_opts = {
    lsp_format = 'fallback',
  },
  formatters = {
    prettier = {
      condition = function(_, ctx)
        -- JS/TS lists prettier then oxfmt with stop_after_first; config alone
        -- selects prettier (has_parser is always true for these filetypes).
        if vim.tbl_contains(formatters_by_ft[vim.bo[ctx.buf].filetype] or {}, 'oxfmt') then
          return prettier.has_config(ctx)
        end
        return prettier.has_parser(ctx) and (vim.g.lazyvim_prettier_needs_config ~= true or prettier.has_config(ctx))
      end,
    },
    ['markdown-toc'] = {
      condition = function(_, ctx)
        for _, line in ipairs(vim.api.nvim_buf_get_lines(ctx.buf, 0, -1, false)) do
          if line:find '<!%-%- toc %-%->' then
            return true
          end
        end
        return false
      end,
    },
    ['markdownlint-cli2'] = {
      condition = function(_, ctx)
        local diagnostics = vim.tbl_filter(function(diagnostic)
          return diagnostic.source == 'markdownlint'
        end, vim.diagnostic.get(ctx.buf))
        return #diagnostics > 0
      end,
    },
    sqlfluff = {
      args = { 'format', '--dialect=ansi', '-' },
    },
  },
  formatters_by_ft = formatters_by_ft,
}

-- Format lives on <leader>cf (LazyVim-style) so <leader>ff can be "find files"
vim.keymap.set({ 'n', 'v' }, '<leader>cf', function()
  require('conform').format { async = true }
end, { desc = 'Format Current Document' })

vim.keymap.set('n', '<leader>uf', function()
  vim.g.autoformat = not vim.g.autoformat
  vim.notify('Auto format: ' .. (vim.g.autoformat and 'enabled' or 'disabled'))
end, { desc = 'Toggle auto format' })

vim.keymap.set('n', '<leader>uF', function()
  local enabled = vim.b.autoformat ~= false
  vim.b.autoformat = not enabled
  vim.notify('Buffer auto format: ' .. (vim.b.autoformat and 'enabled' or 'disabled'))
end, { desc = 'Toggle Local Auto Format' })
