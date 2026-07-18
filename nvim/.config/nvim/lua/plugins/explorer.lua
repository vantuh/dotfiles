return {
  {
    "folke/snacks.nvim",
    opts = {
      picker = {
        sources = {
          explorer = {
            hidden = true, -- show dotfiles (e.g. .config)
            ignored = false, -- keep gitignored hidden (.DS_Store, .env, …)
          },
        },
      },
    },
  },
}
