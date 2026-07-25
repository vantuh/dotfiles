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

-- Core UX required before the first screen or VimEnter session restoration.
require 'custom.colorscheme'
require 'custom.snacks_explorer'
require 'custom.persistence'

local ui_ready_ms
vim.api.nvim_create_autocmd('VimEnter', {
  once = true,
  callback = function() ui_ready_ms = (vim.uv.hrtime() - nvim_start_time) / 1e6 end,
})

-- Everything else loads in order after the first screen.
local after_ui = {
  'custom.mini',
  'custom.bufferline',
  'custom.lualine',
  'custom.treesitter',
  'custom.ts_expand_hover',
  'custom.completion',
  'custom.lsp',
  'custom.gitsigns',
  'custom.lint',
  'custom.todo_comments',
  'custom.which_key',
  'custom.trouble',
  'custom.grug_far',
  'custom.dadbod',
  'custom.conform',
  'custom.lazyvim_habits',
  'custom.ui_extras',
  'custom.noice',
}

for _, module in ipairs(after_ui) do
  local name = module
  lazy.on_vim_enter(function() require(name) end)
end

-- Keep this last so the measurement includes all deferred startup modules.
lazy.on_vim_enter(function()
  local tooling_ready_ms = (vim.uv.hrtime() - nvim_start_time) / 1e6
  if #vim.api.nvim_list_uis() == 0 then return end
  vim.defer_fn(function()
    Snacks.notify.info(('UI ready: %.2f ms\nTooling ready: %.2f ms'):format(ui_ready_ms or 0, tooling_ready_ms), {
      id = 'nvim-startup-time',
      title = 'Neovim Startup',
      timeout = 5000,
    })
  end, 300)
end)

-- vim: ts=2 sts=2 sw=2 et
