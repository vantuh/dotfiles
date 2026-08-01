vim.pack.add { 'https://github.com/folke/trouble.nvim' }

local trouble = require 'trouble'

trouble.setup {
  modes = {
    lsp = {
      win = { position = 'right' },
    },
  },
}

vim.keymap.set('n', '<leader>xx', '<cmd>Trouble diagnostics toggle<CR>', { desc = 'Workspace Diagnostics' })
vim.keymap.set('n', '<leader>xX', '<cmd>Trouble diagnostics toggle filter.buf=0<CR>', { desc = 'Buffer Diagnostics' })
vim.keymap.set('n', '<leader>cs', '<cmd>Trouble symbols toggle<CR>', { desc = 'Code Symbols (Trouble)' })
vim.keymap.set('n', '<leader>cS', '<cmd>Trouble lsp toggle<CR>', { desc = 'Code References/Definitions (Trouble)' })
vim.keymap.set('n', '<leader>xL', '<cmd>Trouble loclist toggle<CR>', { desc = 'Location List (Trouble)' })
vim.keymap.set('n', '<leader>xQ', '<cmd>Trouble qflist toggle<CR>', { desc = 'Quickfix List (Trouble)' })
local function todo_trouble(command)
  return function()
    require 'editor.todo_comments'
    vim.cmd(command)
  end
end

vim.keymap.set('n', '<leader>xt', todo_trouble 'Trouble todo toggle', { desc = 'Todo Comments' })
vim.keymap.set('n', '<leader>xT', todo_trouble 'Trouble todo toggle filter = {tag = {TODO,FIX,FIXME}}', { desc = 'Todo/Fix/Fixme' })

local function quickfix_item(next)
  return function()
    if trouble.is_open() then
      trouble[next and 'next' or 'prev'] { skip_groups = true, jump = true }
      return
    end

    local ok, err = pcall(next and vim.cmd.cnext or vim.cmd.cprevious)
    if not ok then
      vim.notify(err, vim.log.levels.ERROR)
    end
  end
end

vim.keymap.set('n', '[q', quickfix_item(false), { desc = 'Previous Trouble/Quickfix Item' })
vim.keymap.set('n', ']q', quickfix_item(true), { desc = 'Next Trouble/Quickfix Item' })
