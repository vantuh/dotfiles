vim.pack.add { 'https://github.com/MagicDuck/grug-far.nvim' }

local grug = require 'grug-far'

grug.setup {
  headerMaxWidth = 80,
}

vim.keymap.set({ 'n', 'x' }, '<leader>sr', function()
  local extension = vim.bo.buftype == '' and vim.fn.expand '%:e'
  grug.open {
    transient = true,
    prefills = {
      filesFilter = extension and extension ~= '' and '*.' .. extension or nil,
    },
  }
end, { desc = 'Search and Replace' })
