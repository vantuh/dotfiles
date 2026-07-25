vim.pack.add({ 'https://github.com/iamcco/markdown-preview.nvim' })

vim.g.mkdp_filetypes = { 'markdown' }
vim.g.mkdp_auto_close = 0

vim.api.nvim_create_autocmd('FileType', {
  pattern = 'markdown',
  callback = function(event)
    vim.keymap.set('n', '<leader>cp', '<cmd>MarkdownPreviewToggle<CR>', {
      buffer = event.buf,
      desc = 'Markdown Preview',
    })
  end,
})
