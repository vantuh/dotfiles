vim.pack.add({
  'https://github.com/nvim-lua/plenary.nvim', -- todo-comments search
  'https://github.com/folke/todo-comments.nvim',
})
require('todo-comments').setup({ signs = false })
