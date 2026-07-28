vim.pack.add { 'https://github.com/catppuccin/nvim' }

-- auto_integrations = true (default) auto-detects all installed plugins via vim.pack.get
-- and enables their integrations automatically. No need to list them manually.
require('catppuccin').setup {
  flavour = 'mocha',
  dim_inactive = { enabled = true },
}

vim.cmd.colorscheme 'catppuccin'
