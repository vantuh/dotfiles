vim.pack.add({ "https://github.com/folke/snacks.nvim" })

require("snacks").setup({
  explorer = { enabled = true },
  lazygit = { enabled = true },
  terminal = {},
  picker = {
    enabled = true,
    sources = {
      explorer = {
        hidden = true,
        ignored = false,
        layout = {
          preset = "sidebar",
          preview = "main",
        },
        on_show = function(picker)
          picker:toggle("preview", { enable = true })
          vim.schedule(function()
            if not picker.closed then
              picker:show_preview()
            end
          end)
        end,
      },
      files = {
        hidden = true,
        ignored = false,
        matcher = {
          frecency = true,
          sort_empty = true,
        },
      },
    },
  },
})

vim.keymap.set("n", "<leader>e", function()
  Snacks.explorer()
end, { desc = "File Explorer" })

vim.keymap.set("n", "<leader><space>", function()
  Snacks.picker.files({ cwd = Snacks.git.get_root() })
end, { desc = "Find Files (Git Root)" })

vim.keymap.set("n", "<leader>,", function()
  Snacks.picker.buffers()
end, { desc = "Buffers" })

vim.keymap.set("n", "<leader>/", function()
  Snacks.picker.grep({ cwd = Snacks.git.get_root() })
end, { desc = "Grep Project" })

vim.keymap.set("n", "<leader>gg", function()
  Snacks.lazygit({ cwd = Snacks.git.get_root() })
end, { desc = "Lazygit (Git Root)" })

vim.keymap.set("n", "<leader>gG", function()
  Snacks.lazygit()
end, { desc = "Lazygit (cwd)" })

vim.keymap.set("n", "<leader>gh", function()
  Snacks.terminal.toggle({ "hunk", "diff", "--watch" }, {
    cwd = Snacks.git.get_root() or vim.uv.cwd(),
    win = {
      position = "float",
      width = 0.95,
      height = 0.9,
      border = "rounded",
      backdrop = 60,
    },
  })
end, { desc = "Hunk Review" })
