vim.pack.add { 'https://github.com/folke/trouble.nvim' }

local trouble = require 'trouble'

trouble.setup {
  modes = {
    lsp = {
      win = { position = 'right' },
    },
  },
}

vim.keymap.set('n', '<leader>xx', '<cmd>Trouble diagnostics toggle<CR>', { desc = 'Diagnostics (Trouble)' })
vim.keymap.set('n', '<leader>xX', '<cmd>Trouble diagnostics toggle filter.buf=0<CR>', { desc = 'Buffer Diagnostics (Trouble)' })
vim.keymap.set('n', '<leader>cs', '<cmd>Trouble symbols toggle<CR>', { desc = 'Symbols (Trouble)' })
vim.keymap.set('n', '<leader>cS', '<cmd>Trouble lsp toggle<CR>', { desc = 'LSP References/Definitions (Trouble)' })
vim.keymap.set('n', '<leader>xL', '<cmd>Trouble loclist toggle<CR>', { desc = 'Location List (Trouble)' })
vim.keymap.set('n', '<leader>xQ', '<cmd>Trouble qflist toggle<CR>', { desc = 'Quickfix List (Trouble)' })
vim.keymap.set('n', '<leader>xt', '<cmd>Trouble todo toggle<CR>', { desc = 'TODO Comments (Trouble)' })
vim.keymap.set('n', '<leader>xT', '<cmd>Trouble todo toggle filter = {tag = {TODO,FIX,FIXME}}<CR>', { desc = 'TODO/FIX/FIXME (Trouble)' })
vim.keymap.set('n', '<leader>st', '<cmd>Trouble todo toggle<CR>', { desc = 'TODO Comments' })

local function quickfix_item(next)
  return function()
    if trouble.is_open() then
      trouble[next and 'next' or 'prev'] { skip_groups = true, jump = true }
      return
    end

    local ok, err = pcall(next and vim.cmd.cnext or vim.cmd.cprevious)
    if not ok then vim.notify(err, vim.log.levels.ERROR) end
  end
end

vim.keymap.set('n', '[q', quickfix_item(false), { desc = 'Previous Trouble/Quickfix Item' })
vim.keymap.set('n', ']q', quickfix_item(true), { desc = 'Next Trouble/Quickfix Item' })
