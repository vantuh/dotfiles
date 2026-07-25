vim.pack.add({ 'https://github.com/iamcco/markdown-preview.nvim' })

vim.g.mkdp_filetypes = { 'markdown' }
vim.g.mkdp_auto_close = 0

local function set_preview_keymap(buf)
  vim.keymap.set('n', '<leader>cp', '<cmd>MarkdownPreviewToggle<CR>', {
    buffer = buf,
    desc = 'Markdown Preview',
  })
end

vim.api.nvim_create_autocmd('FileType', {
  pattern = 'markdown',
  callback = function(event) set_preview_keymap(event.buf) end,
})

-- The module itself may be loaded by the FileType event.
if vim.bo.filetype == 'markdown' then set_preview_keymap(0) end
