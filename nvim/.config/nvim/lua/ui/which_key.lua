vim.pack.add { 'https://github.com/folke/which-key.nvim' }

-- Group names must be plain words (LazyVim-style). Bracketed mnemonics like
-- `[B]uffer` break which-key's desc pattern matching, so icons never appear.
require('which-key').setup {
  delay = 0,
  icons = { mappings = vim.g.have_nerd_font },
  spec = {
    { '<leader>s', group = 'search', mode = { 'n', 'v' } },
    { '<leader>f', group = 'file/find' },
    { '<leader>c', group = 'code' },
    { '<leader>b', group = 'buffer' },
    { '<leader>g', group = 'git' },
    { '<leader>h', group = 'git hunks', mode = { 'n', 'v' } },
    { '<leader>q', group = 'quit/session' },
    { '<leader>p', group = 'pack', icon = { icon = '󰏖 ', color = 'yellow' } },
    { '<leader>x', group = 'diagnostics/quickfix' },
    { '<leader>u', group = 'ui' },
    { '<leader>w', group = 'windows' },
    { '<leader>d', group = 'profiler' },
    { '<leader>dp', group = 'profiler' },
    { 'gr', group = 'LSP Actions', mode = { 'n' }, icon = { icon = ' ', color = 'orange' } },
    -- Snacks keys whose descs don't match built-in icon rules (no lazy.nvim plugin link)
    { '<leader>/', icon = { icon = ' ', color = 'green' } },
    { '<leader>:', icon = { icon = '󰘳 ', color = 'purple' } },
  },
}

-- Window hydra: loop through <C-w> mappings via which-key
vim.keymap.set('n', '<C-w><space>', function()
  require('which-key').show { keys = '<c-w>', loop = true }
end, { desc = 'Window Hydra Mode (which-key)' })
