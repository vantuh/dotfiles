-- mini.nvim modules (statusline lives in custom/lualine.lua instead).

vim.pack.add({ 'https://github.com/nvim-mini/mini.nvim' })

if vim.g.have_nerd_font then
  require('mini.icons').setup()
  -- Backwards compatibility with plugins that require nvim-web-devicons
  MiniIcons.mock_nvim_web_devicons()
end

require('mini.ai').setup({
  -- Avoid conflicts with built-in incremental selection on Neovim>=0.12
  mappings = {
    around_next = 'aa',
    inside_next = 'ii',
  },
  n_lines = 500,
})

require('mini.surround').setup()
