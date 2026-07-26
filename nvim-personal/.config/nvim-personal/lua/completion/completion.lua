-- Snippets (LuaSnip) + autocomplete (blink.cmp).

vim.pack.add {
  { src = 'https://github.com/L3MON4D3/LuaSnip', version = vim.version.range '2.*' },
}
require('luasnip').setup {}

-- Premade snippets: pack is cheap; scanning 144 JSON files is not — wait until insert.
vim.pack.add { 'https://github.com/rafamadriz/friendly-snippets' }
vim.api.nvim_create_autocmd('InsertEnter', {
  once = true,
  callback = function() require('luasnip.loaders.from_vscode').lazy_load() end,
})

require('completion.blink').setup {
  keymap = {
    preset = 'enter', -- 'enter' = <CR> accepts the (preselected) first item
  },
  appearance = {
    nerd_font_variant = 'mono',
  },
  completion = {
    documentation = { auto_show = false, auto_show_delay_ms = 500 },
  },
  sources = {
    default = { 'lsp', 'path', 'snippets' },
    per_filetype = {
      lua = { inherit_defaults = true, 'lazydev' },
      sql = { inherit_defaults = true, 'dadbod' },
      mysql = { inherit_defaults = true, 'dadbod' },
      plsql = { inherit_defaults = true, 'dadbod' },
    },
    providers = {
      dadbod = {
        name = 'Dadbod',
        module = 'vim_dadbod_completion.blink',
      },
      lazydev = {
        name = 'LazyDev',
        module = 'lazydev.integrations.blink',
        score_offset = 100,
      },
    },
  },
  snippets = { preset = 'luasnip' },
  fuzzy = { implementation = 'lua' },
  signature = { enabled = true },
}
