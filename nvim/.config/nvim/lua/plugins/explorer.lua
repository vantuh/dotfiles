return {
  {
    "folke/snacks.nvim",
    opts = {
      picker = {
        sources = {
          explorer = {
            hidden = true, -- show dotfiles (e.g. .config)
            ignored = false, -- keep gitignored hidden (.DS_Store, .env, …)
            layout = { -- show preview
              preset = "sidebar",
              preview = {
                enabled = true,
                main = true,
              },
            },
          },
          -- Space Space / <leader>ff
          files = {
            hidden = true,
            ignored = false,
          },
        },
      },
    },
  },
}
