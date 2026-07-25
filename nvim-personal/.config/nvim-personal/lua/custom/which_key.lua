vim.pack.add({ 'https://github.com/folke/which-key.nvim' })

require('which-key').setup({
  delay = 0,
  icons = { mappings = vim.g.have_nerd_font },
  spec = {
    { '<leader>s', group = '[S]earch', mode = { 'n', 'v' } },
    { '<leader>f', group = '[F]ind' },
    { '<leader>c', group = '[C]ode' },
    { '<leader>b', group = '[B]uffer' },
    { '<leader>t', group = '[T]oggle' },
    { '<leader>g', group = '[G]it' },
    { '<leader>h', group = 'Git [H]unk', mode = { 'n', 'v' } },
    { 'gr', group = 'LSP Actions', mode = { 'n' } },
  },
})
