-- LazyVim-like statusline (without LazyVim helpers / noice / trouble).
vim.pack.add({ "https://github.com/nvim-lualine/lualine.nvim" })

vim.o.laststatus = 3

require("lualine").setup({
  options = {
    theme = "auto",
    globalstatus = true,
    disabled_filetypes = {
      statusline = { "dashboard", "alpha", "ministarter", "snacks_dashboard" },
    },
  },
  sections = {
    lualine_a = { "mode" },
    lualine_b = { "branch" },
    lualine_c = {
      {
        "diagnostics",
        symbols = {
          error = " ",
          warn = " ",
          info = " ",
          hint = " ",
        },
      },
      { "filetype", icon_only = true, separator = "", padding = { left = 1, right = 0 } },
      { "filename", path = 1 },
    },
    lualine_x = {
      {
        function()
          local names = vim.iter(vim.lsp.get_clients({ bufnr = 0 }))
            :map(function(client) return client.name end)
            :totable()
          table.sort(names)
          return table.concat(names, ", ")
        end,
        icon = "",
      },
      {
        "diff",
        source = function()
          local gitsigns = vim.b.gitsigns_status_dict
          if gitsigns then
            return {
              added = gitsigns.added,
              modified = gitsigns.changed,
              removed = gitsigns.removed,
            }
          end
        end,
      },
    },
    lualine_y = {
      { "progress", separator = " ", padding = { left = 1, right = 0 } },
      { "location", padding = { left = 0, right = 1 } },
    },
    lualine_z = {
      function()
        return " " .. os.date("%R")
      end,
    },
  },
  extensions = { "mason" },
})

vim.api.nvim_create_autocmd({ "LspAttach", "LspDetach" }, {
  group = vim.api.nvim_create_augroup("custom-lualine-lsp", { clear = true }),
  callback = function() require("lualine").refresh() end,
})

