vim.pack.add({ 'https://github.com/iamcco/markdown-preview.nvim' })

vim.g.mkdp_filetypes = { 'markdown' }
vim.g.mkdp_auto_close = 0

vim.keymap.set('n', '<leader>mp', '<cmd>MarkdownPreviewToggle<cr>', { desc = '[M]arkdown [P]review toggle' })
