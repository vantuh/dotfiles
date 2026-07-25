vim.pack.add({ "https://github.com/folke/snacks.nvim" })

require("snacks").setup({
  explorer = { enabled = true },
  lazygit = { enabled = true },
  indent = { enabled = true },
  input = { enabled = true },
  -- Top-right toasts (replaces the bottom message row together with noice + cmdheight=0)
  notifier = {
    enabled = true,
    top_down = true,
    timeout = 3000,
  },
  scroll = {
    animate = {
      duration = { step = 5, total = 80 },
      easing = "linear",
    },
    animate_repeat = {
      delay = 0,
      duration = { step = 1, total = 0 },
      easing = "linear",
    },
  },
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
  Snacks.explorer({ cwd = vim.uv.cwd() })
end, { desc = "File Explorer (cwd)" })

vim.keymap.set("n", "<leader>n", function()
  if Snacks.config.picker and Snacks.config.picker.enabled then
    Snacks.picker.notifications()
  else
    Snacks.notifier.show_history()
  end
end, { desc = "Notification History" })

vim.keymap.set("n", "<leader>un", function()
  Snacks.notifier.hide()
end, { desc = "Dismiss All Notifications" })

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
