-- Personal Neovim config (Kickstart-based).
-- Core bootstrap stays here; plugin groups live under lua/{ui,editor,lang,lsp,completion}/

local nvim_start_time = vim.uv.hrtime()

require 'core.options'
require 'core.keymaps'
require 'core.autocmds'
-- pack must load before any module that calls vim.pack.add() (hook ordering).
require 'pack'

local defer = require 'defer'
defer.on({ 'BufReadPre', 'BufNewFile' }, 'editor.guess_indent')
defer.on('InsertEnter', 'editor.autosave')
defer.on('FileType', 'lang.markdown_preview', { pattern = 'markdown' })
defer.on('FileType', 'lang.render_markdown', { pattern = { 'markdown', 'markdown.mdx' } })
defer.on('FileType', 'editor.dadbod', { pattern = { 'sql', 'mysql', 'plsql' } })

-- Core UX required before the first screen or VimEnter session restoration.
require 'ui.colorscheme'
require 'editor.snacks'
require 'editor.persistence'

local ui_ready_ms
vim.api.nvim_create_autocmd('VimEnter', {
  once = true,
  callback = function()
    ui_ready_ms = (vim.uv.hrtime() - nvim_start_time) / 1e6
  end,
})

-- Everything else loads in order after the first screen.
local after_ui = {
  'editor.mini',
  'ui.bufferline',
  'ui.lualine',
  'lang.treesitter',
  'lang.ts_expand_hover',
  'completion.completion',
  'lsp.lsp',
  'editor.gitsigns',
  'lsp.lint',
  'editor.todo_comments',
  'ui.which_key',
  'lsp.trouble',
  'editor.grug_far',
  'lsp.conform',
  'editor.flash',
  'ui.ui_extras',
  'ui.noice',
}

for _, module in ipairs(after_ui) do
  defer.on_vim_enter(function()
    defer.safe_require(module)
  end)
end

-- Keep this last so the measurement includes all deferred startup modules.
defer.on_vim_enter(function()
  local modules_loaded_ms = (vim.uv.hrtime() - nvim_start_time) / 1e6
  if #vim.api.nvim_list_uis() == 0 then
    return
  end
  vim.defer_fn(function()
    Snacks.notify.info(('UI ready: %.2f ms\nModules loaded: %.2f ms'):format(ui_ready_ms or 0, modules_loaded_ms), {
      id = 'nvim-startup-time',
      title = 'Neovim Startup',
      timeout = 5000,
    })
  end, 300)
end)

-- vim: ts=2 sts=2 sw=2 et
