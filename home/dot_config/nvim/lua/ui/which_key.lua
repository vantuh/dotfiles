vim.pack.add { 'https://github.com/folke/which-key.nvim' }

-- Plain group names let which-key's built-in description rules select icons.
require('which-key').setup {
  delay = 0,
  icons = {
    mappings = vim.g.have_nerd_font,
  },
  spec = {
    { '<leader>s', group = 'search', mode = { 'n', 'v' } },
    { '<leader>f', group = 'file/find' },
    { '<leader>c', group = 'code' },
    { '<leader>b', group = 'buffer' },
    { '<leader>g', group = 'git' },
    { '<leader>gg', icon = { icon = ' ', color = 'orange' } },
    { '<leader>gH', icon = { icon = '󰊢 ', color = 'green' } },
    { '<leader>h', group = 'git hunks', mode = { 'n', 'v' } },
    { '<leader>q', group = 'quit/session' },
    { '<leader>p', group = 'pack', icon = { icon = '󰏖 ', color = 'yellow' } },
    { '<leader>pu', icon = { icon = '󰚰 ', color = 'green' } },
    { '<leader>pi', icon = { icon = '󰇚 ', color = 'yellow' } },
    { '<leader>po', icon = { icon = '󰖪 ', color = 'blue' } },
    { '<leader>pc', icon = { icon = '󰆴 ', color = 'red' } },
    { '<leader>pm', icon = { icon = '󱌣 ', color = 'blue' } },
    { '<leader>x', group = 'diagnostics/quickfix' },
    { '<leader>xl', icon = { icon = '󰍉 ', color = 'green' } },
    { '<leader>xL', icon = { icon = '󰔫 ', color = 'red' } },
    { '<leader>xq', icon = { icon = '󱖫 ', color = 'green' } },
    { '<leader>xQ', icon = { icon = '󰔫 ', color = 'red' } },
    { '<leader>xt', icon = { icon = '󰄱 ', color = 'yellow' } },
    { '<leader>xT', icon = { icon = '󰄱 ', color = 'yellow' } },
    { '<leader>xx', icon = { icon = '󱖫 ', color = 'green' } },
    { '<leader>xX', icon = { icon = '󰈔 ', color = 'cyan' } },
    { '<leader>u', group = 'ui' },
    { '<leader>w', group = 'windows' },
    { '<leader>sR', icon = { icon = '󰐊 ', color = 'green' } },
    { 'gr', group = 'LSP Actions', mode = { 'n' }, icon = { icon = ' ', color = 'orange' } },
  },
}

-- Window hydra: loop through <C-w> mappings via which-key
vim.keymap.set('n', '<C-w><space>', function()
  require('which-key').show { keys = '<c-w>', loop = true }
end, { desc = 'Window Hydra Mode (which-key)' })
