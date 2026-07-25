vim.pack.add({ "https://github.com/akinsho/bufferline.nvim" })

vim.opt.termguicolors = true

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

vim.keymap.set("n", "<leader>bb", "<cmd>e #<CR>", { desc = "Switch to Other Buffer" })
vim.keymap.set("n", "<leader>`", "<cmd>e #<CR>", { desc = "Switch to Other Buffer" })

vim.keymap.set("n", "<S-h>", "<cmd>BufferLineCyclePrev<CR>", { desc = "Previous Buffer" })
vim.keymap.set("n", "<S-l>", "<cmd>BufferLineCycleNext<CR>", { desc = "Next Buffer" })
vim.keymap.set("n", "[b", "<cmd>BufferLineCyclePrev<CR>", { desc = "Previous Buffer" })
vim.keymap.set("n", "]b", "<cmd>BufferLineCycleNext<CR>", { desc = "Next Buffer" })

