-- LazyVim-style message/cmdline UI. Keeps snacks.notifier for top-right toasts.
-- Depends on nui.nvim (already pulled in by custom.ui_extras).

vim.pack.add({ 'https://github.com/folke/noice.nvim' })

require('noice').setup({
  -- snacks.notifier owns vim.notify → top-right toasts
  notify = { enabled = false },
  lsp = {
    override = {
      ['vim.lsp.util.convert_input_to_markdown_lines'] = true,
      ['vim.lsp.util.stylize_markdown'] = true,
      ['cmp.entry.get_documentation'] = true,
    },
  },
  routes = {
    {
      filter = {
        event = 'msg_show',
        any = {
          { find = '%d+L, %d+B' },
          { find = '; after #%d+' },
          { find = '; before #%d+' },
        },
      },
      view = 'mini',
    },
  },
  presets = {
    bottom_search = true,
    command_palette = true,
    long_message_to_split = true,
  },
})
