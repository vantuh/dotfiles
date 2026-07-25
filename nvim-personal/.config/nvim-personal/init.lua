-- Personal Neovim config (Kickstart-based).
-- Core bootstrap stays here; each vim.pack plugin group lives in lua/custom/*.lua

require 'custom.options'
require 'custom.keymaps'
require 'custom.pack'

-- Core UX
require 'custom.guess_indent'
require 'custom.gitsigns'
require 'custom.which_key'
require 'custom.colorscheme'
require 'custom.todo_comments'
require 'custom.mini'

-- Search / LSP / format / completion
require 'custom.telescope'
require 'custom.lsp'
require 'custom.conform'
require 'custom.autosave'
require 'custom.completion'
require 'custom.treesitter'

-- LazyVim-carried UX
require 'custom.snacks_explorer'
require 'custom.bufferline'
require 'custom.persistence'
require 'custom.lazyvim_habits'
require 'custom.lualine'
require 'custom.ui_extras'
require 'custom.noice'
require 'custom.ts_expand_hover'

-- Optional kickstart examples (disabled by default):
-- require 'kickstart.plugins.lint'
-- require 'kickstart.plugins.autopairs'
-- require 'kickstart.plugins.gitsigns'
-- require 'custom.plugins'

-- vim: ts=2 sts=2 sw=2 et
