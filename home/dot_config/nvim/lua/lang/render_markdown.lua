vim.pack.add { 'https://github.com/MeanderingProgrammer/render-markdown.nvim' }

local render_markdown = require 'render-markdown'

render_markdown.setup {
  code = {
    sign = false,
    width = 'block',
    right_pad = 1,
  },
  heading = {
    sign = false,
    icons = {},
  },
  checkbox = {
    enabled = false,
  },
}

Snacks.toggle({
  name = 'Render Markdown',
  get = render_markdown.get,
  set = render_markdown.set,
}):map '<leader>um'
