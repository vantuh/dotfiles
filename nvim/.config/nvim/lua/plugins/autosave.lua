return {
  {
    "okuuva/auto-save.nvim",
    event = { "InsertLeave", "TextChanged" },
    opts = {
      debounce_delay = 500,
    },
  },
}
