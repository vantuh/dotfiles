vim.pack.add { 'https://github.com/folke/which-key.nvim' }

require('which-key').setup {
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
    { '<leader>q', group = '[Q]uit/session' },
    { '<leader>p', group = '[P]ack' },
    { '<leader>x', group = 'Diagnosti[x]' },
    { '<leader>u', group = '[U]I/Toggle' },
    { '<leader>w', group = '[W]indows' },
    { '<leader><Tab>', group = '[T]abs' },
    { '<leader>dp', group = '[P]rofiler' },
    { 'gr', group = 'LSP Actions', mode = { 'n' } },
  },
}

-- Window hydra: loop through <C-w> mappings via which-key
vim.keymap.set('n', '<C-w><space>', function()
  require('which-key').show { keys = '<c-w>', loop = true }
end, { desc = 'Window Hydra Mode (which-key)' })
