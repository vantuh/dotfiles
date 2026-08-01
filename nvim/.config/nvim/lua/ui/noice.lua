-- LazyVim-style message/cmdline UI. Keeps snacks.notifier for top-right toasts.

vim.pack.add {
  'https://github.com/MunifTanjim/nui.nvim', -- required by noice; also used by ui.ui_extras
  'https://github.com/folke/noice.nvim',
}

require('noice').setup {
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
}

-- Noice keymaps (LazyVim parity)
vim.keymap.set('n', '<leader>snl', function()
  require('noice').cmd 'last'
end, { desc = 'Noice Last Message' })
vim.keymap.set('n', '<leader>snh', function()
  require('noice').cmd 'history'
end, { desc = 'Noice History' })
vim.keymap.set('n', '<leader>sna', function()
  require('noice').cmd 'all'
end, { desc = 'Noice All' })
vim.keymap.set('n', '<leader>snd', function()
  require('noice').cmd 'dismiss'
end, { desc = 'Noice Dismiss All Messages' })

-- Scroll LSP / Noice popups in normal mode
vim.keymap.set({ 'i', 's' }, '<C-f>', function()
  if not require('noice.lsp').scroll(4) then
    return '<C-f>'
  end
end, { silent = true, expr = true, desc = 'Scroll Forward' })
vim.keymap.set({ 'i', 's' }, '<C-b>', function()
  if not require('noice.lsp').scroll(-4) then
    return '<C-b>'
  end
end, { silent = true, expr = true, desc = 'Scroll Backward' })
