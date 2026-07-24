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

vim.keymap.set("n", "<S-h>", "<cmd>BufferLineCyclePrev<CR>", { desc = "Previous Buffer" })
vim.keymap.set("n", "<S-l>", "<cmd>BufferLineCycleNext<CR>", { desc = "Next Buffer" })
vim.keymap.set("n", "[b", "<cmd>BufferLineCyclePrev<CR>", { desc = "Previous Buffer" })
vim.keymap.set("n", "]b", "<cmd>BufferLineCycleNext<CR>", { desc = "Next Buffer" })
