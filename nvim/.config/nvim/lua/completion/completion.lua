-- Native snippets + autocomplete (blink.cmp).

-- Blink's native snippets source loads friendly-snippets automatically.
vim.pack.add { 'https://github.com/rafamadriz/friendly-snippets' }

require('completion.blink').setup {
  keymap = {
    preset = 'enter', -- 'enter' = <CR> accepts the (preselected) first item
    ['<C-y>'] = { 'select_and_accept' },
  },
  appearance = {
    nerd_font_variant = 'mono',
    kind_icons = {
      Array = ' ',
      Boolean = '󰨙 ',
      Class = ' ',
      Color = ' ',
      Constant = '󰏿 ',
      Constructor = ' ',
      Control = ' ',
      Enum = ' ',
      EnumMember = ' ',
      Event = ' ',
      Field = ' ',
      File = ' ',
      Folder = ' ',
      Function = '󰊕 ',
      Interface = ' ',
      Key = ' ',
      Keyword = ' ',
      Method = '󰊕 ',
      Module = ' ',
      Namespace = '󰦮 ',
      Null = ' ',
      Number = '󰎠 ',
      Object = ' ',
      Operator = ' ',
      Package = ' ',
      Property = ' ',
      Reference = ' ',
      Snippet = '󱄽 ',
      String = ' ',
      Struct = '󰆼 ',
      Text = ' ',
      TypeParameter = ' ',
      Unit = ' ',
      Value = ' ',
      Variable = '󰀫 ',
    },
  },
  completion = {
    documentation = { auto_show = true, auto_show_delay_ms = 200 },
  },
  sources = {
    default = { 'lsp', 'path', 'snippets', 'buffer' },
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
  cmdline = {
    enabled = true,
    keymap = {
      preset = 'cmdline',
      ['<Right>'] = false,
      ['<Left>'] = false,
    },
    completion = {
      list = { selection = { preselect = false } },
      menu = {
        auto_show = function(ctx)
          return vim.fn.getcmdtype() == ':'
        end,
      },
      ghost_text = { enabled = true },
    },
  },
  fuzzy = { implementation = 'lua' },
  signature = { enabled = true },
}
