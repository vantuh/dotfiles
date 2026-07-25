-- Personal Neovim config (Kickstart-based).
-- Core bootstrap stays here; each vim.pack plugin group lives in lua/custom/*.lua

local nvim_start_time = vim.uv.hrtime()

require 'custom.options'
require 'custom.keymaps'
require 'custom.autocmds'
require 'custom.pack'

local lazy = require 'custom.lazy'
lazy.on({ 'BufReadPre', 'BufNewFile' }, 'custom.guess_indent')
lazy.on('InsertEnter', 'custom.autosave')
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

-- Language tooling loads after the first screen, in dependency order.
on_vim_enter 'custom.treesitter'
on_vim_enter 'custom.ts_expand_hover'
on_vim_enter 'custom.completion'
on_vim_enter 'custom.lsp'
on_vim_enter 'custom.gitsigns'
on_vim_enter 'custom.lint'
on_vim_enter 'custom.todo_comments'

-- Remaining UI and tools load immediately after the first screen is drawn.
on_vim_enter 'custom.which_key'
on_vim_enter 'custom.trouble'
on_vim_enter 'custom.grug_far'
on_vim_enter 'custom.dadbod'
on_vim_enter 'custom.conform'
on_vim_enter 'custom.lazyvim_habits'
on_vim_enter 'custom.ui_extras'
on_vim_enter 'custom.noice'

-- Keep this last so the measurement includes all deferred startup modules.
lazy.on_vim_enter(function()
  local startup_ms = (vim.uv.hrtime() - nvim_start_time) / 1e6
  vim.defer_fn(function()
    Snacks.notify.info(('Loaded in %.2f ms'):format(startup_ms), {
      id = 'nvim-startup-time',
      title = 'Neovim Startup',
      timeout = 5000,
    })
  end, 300)
end)

-- vim: ts=2 sts=2 sw=2 et
