-- Personal Neovim config (Kickstart-based).
-- Core bootstrap stays here; each vim.pack plugin group lives in lua/custom/*.lua

require 'custom.options'
require 'custom.keymaps'
require 'custom.autocmds'
require 'custom.pack'

local lazy = require 'custom.lazy'
lazy.on({ 'BufReadPre', 'BufNewFile' }, 'custom.guess_indent')
lazy.on({ 'BufReadPre', 'BufNewFile' }, 'custom.gitsigns')
lazy.on({ 'BufReadPre', 'BufNewFile' }, 'custom.todo_comments')
lazy.on({ 'BufReadPre', 'BufNewFile' }, 'custom.lsp')
lazy.on({ 'BufReadPre', 'BufNewFile' }, 'custom.lint')
lazy.on({ 'BufReadPost', 'BufNewFile', 'InsertEnter' }, 'custom.completion')
lazy.on('InsertEnter', 'custom.autosave')
lazy.on('FileType', 'custom.treesitter')
lazy.on('FileType', 'custom.ts_expand_hover', { pattern = { 'typescript', 'typescriptreact' } })
lazy.on('FileType', 'custom.markdown_preview', { pattern = 'markdown' })
lazy.on('FileType', 'custom.render_markdown', { pattern = { 'markdown', 'markdown.mdx' } })

-- Core UX
require 'custom.which_key'
require 'custom.colorscheme'
require 'custom.trouble'
require 'custom.grug_far'
require 'custom.dadbod'
require 'custom.mini'

-- Search / formatting
require 'custom.conform'

-- LazyVim-carried UX
require 'custom.snacks_explorer'
require 'custom.bufferline'
require 'custom.persistence'
require 'custom.lazyvim_habits'
require 'custom.lualine'
require 'custom.ui_extras'
require 'custom.noice'

-- vim: ts=2 sts=2 sw=2 et
