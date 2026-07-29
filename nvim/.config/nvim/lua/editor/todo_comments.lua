vim.pack.add {
  'https://github.com/nvim-lua/plenary.nvim', -- todo-comments search
  'https://github.com/folke/todo-comments.nvim',
}
require('todo-comments').setup { signs = false }

vim.keymap.set('n', ']t', function()
  require('todo-comments').jump_next()
end, { desc = 'Next TODO Comment' })
vim.keymap.set('n', '[t', function()
  require('todo-comments').jump_prev()
end, { desc = 'Previous TODO Comment' })
vim.keymap.set('n', '<leader>st', function()
  Snacks.picker.todo_comments()
end, { desc = 'Todo' })
vim.keymap.set('n', '<leader>sT', function()
  Snacks.picker.todo_comments { keywords = { 'TODO', 'FIX', 'FIXME' } }
end, { desc = 'Todo/Fix/Fixme' })
