vim.pack.add({ "https://github.com/akinsho/bufferline.nvim" })

require("bufferline").setup({
  options = {
    close_command = function(bufnr)
      Snacks.bufdelete(bufnr)
    end,
    right_mouse_command = function(bufnr)
      Snacks.bufdelete(bufnr)
    end,
    diagnostics = "nvim_lsp",
    always_show_bufferline = false,
    offsets = {
      { filetype = "snacks_layout_box" },
    },
  },
})

vim.keymap.set("n", "<leader>bd", function()
  Snacks.bufdelete()
end, { desc = "Delete Buffer" })

vim.keymap.set("n", "<leader>bo", function()
  Snacks.bufdelete.other()
end, { desc = "Delete Other Buffers" })

vim.keymap.set("n", "<leader>bi", function()
  Snacks.bufdelete.invisible()
end, { desc = "Delete Invisible Buffers" })

vim.keymap.set("n", "<leader>bD", "<cmd>bdelete<CR>", { desc = "Delete Buffer and Window" })

vim.keymap.set("n", "<leader>bb", "<cmd>e #<CR>", { desc = "Switch to Other Buffer" })
vim.keymap.set("n", "<leader>`", "<cmd>e #<CR>", { desc = "Switch to Other Buffer" })

vim.keymap.set("n", "<S-h>", "<cmd>BufferLineCyclePrev<CR>", { desc = "Previous Buffer" })
vim.keymap.set("n", "<S-l>", "<cmd>BufferLineCycleNext<CR>", { desc = "Next Buffer" })
vim.keymap.set("n", "[b", "<cmd>BufferLineCyclePrev<CR>", { desc = "Previous Buffer" })
vim.keymap.set("n", "]b", "<cmd>BufferLineCycleNext<CR>", { desc = "Next Buffer" })

vim.keymap.set("n", "<leader>bp", "<cmd>BufferLineTogglePin<CR>", { desc = "Toggle Pin" })
vim.keymap.set("n", "<leader>bl", "<cmd>BufferLineCloseLeft<CR>", { desc = "Delete Buffers to the Left" })
vim.keymap.set("n", "<leader>br", "<cmd>BufferLineCloseRight<CR>", { desc = "Delete Buffers to the Right" })
