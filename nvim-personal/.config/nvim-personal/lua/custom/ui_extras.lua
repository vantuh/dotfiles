-- Small UI extras carried over from the LazyVim config.

vim.pack.add({
  "https://github.com/lukas-reineke/virt-column.nvim",
  "https://github.com/MunifTanjim/nui.nvim",
  "https://github.com/m4xshen/hardtime.nvim",
})

require("virt-column").setup({
  char = "│",
  virtcolumn = "80",
})

require("hardtime").setup({
  restriction_mode = "hint",
})
