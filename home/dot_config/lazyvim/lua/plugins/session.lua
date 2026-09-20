return {
  {
    "folke/persistence.nvim",
    init = function()
      vim.api.nvim_create_autocmd("VimEnter", {
        once = true,
        callback = function()
          if vim.fn.argc() == 0 then
            vim.schedule(function()
              require("persistence").load()
            end)
          end
        end,
      })
    end,
  },
}
