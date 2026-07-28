vim.pack.add { 'https://github.com/catppuccin/nvim' }

require('catppuccin').setup {
  flavour = 'mocha',
  integrations = {
    blink_cmp = true,
    bufferline = true,
    gitsigns = true,
    noice = true,
    snacks = true,
    treesitter = true,
    which_key = true,
    mini = { enabled = true },
    lsp_trouble = true,
  },
}

vim.cmd.colorscheme 'catppuccin'
