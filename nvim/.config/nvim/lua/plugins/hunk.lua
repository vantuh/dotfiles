return {
  {
    "folke/snacks.nvim",
    keys = {
      {
        "<leader>gH",
        function()
          Snacks.terminal.toggle({ "hunk", "diff", "--watch" }, {
            cwd = LazyVim.root(),
            win = {
              position = "float",
              width = 0.95,
              height = 0.9,
              border = "rounded",
              backdrop = 60,
            },
          })
        end,
        desc = "Hunk Review",
      },
    },
  },
}
