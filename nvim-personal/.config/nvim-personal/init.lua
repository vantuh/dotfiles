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
lazy.on({ 'BufReadPre', 'BufNewFile' }, 'custom.lint')
lazy.on({ 'BufReadPost', 'BufNewFile', 'InsertEnter' }, 'custom.completion')
lazy.on('InsertEnter', 'custom.autosave')
lazy.on('FileType', 'custom.treesitter')
lazy.on('FileType', 'custom.ts_expand_hover', { pattern = { 'typescript', 'typescriptreact' } })
lazy.on('FileType', 'custom.markdown_preview', { pattern = 'markdown' })
lazy.on('FileType', 'custom.render_markdown', { pattern = { 'markdown', 'markdown.mdx' } })

local function on_vim_enter(module, opts)
  lazy.on_vim_enter(function() require(module) end, opts)
end

-- Core UX required before the first screen or VimEnter session restoration.
require 'custom.colorscheme'
require 'custom.snacks_explorer'
require 'custom.persistence'

-- UI that must be ready for the first post-VimEnter redraw.
on_vim_enter('custom.mini', { sync = true })
on_vim_enter('custom.bufferline', { sync = true })
on_vim_enter('custom.lualine', { sync = true })

-- Remaining UI and tools load immediately after the first screen is drawn.
on_vim_enter 'custom.lsp'
on_vim_enter 'custom.which_key'
on_vim_enter 'custom.trouble'
on_vim_enter 'custom.grug_far'
on_vim_enter 'custom.dadbod'
on_vim_enter 'custom.conform'
on_vim_enter 'custom.lazyvim_habits'
on_vim_enter 'custom.ui_extras'
on_vim_enter 'custom.noice'

-- vim: ts=2 sts=2 sw=2 et
