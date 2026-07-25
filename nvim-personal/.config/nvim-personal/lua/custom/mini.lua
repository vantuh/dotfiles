-- mini.nvim modules (statusline lives in custom/lualine.lua instead).

vim.pack.add({ 'https://github.com/nvim-mini/mini.nvim' })

if vim.g.have_nerd_font then
  require('mini.icons').setup()
  -- Backwards compatibility with plugins that require nvim-web-devicons
  MiniIcons.mock_nvim_web_devicons()
end

local pair_options = {
  modes = { insert = true, command = true, terminal = false },
  skip_next = [=[[%w%%%'%[%"%.%`%$]]=],
  skip_ts = { 'string' },
  skip_unbalanced = true,
  markdown = true,
}

local pairs = require 'mini.pairs'
pairs.setup(pair_options)

local open_pair = pairs.open
pairs.open = function(pair, neigh_pattern)
  if vim.fn.getcmdline() ~= '' then return open_pair(pair, neigh_pattern) end

  local opening, closing = pair:sub(1, 1), pair:sub(2, 2)
  local line = vim.api.nvim_get_current_line()
  local cursor = vim.api.nvim_win_get_cursor(0)
  local next_character = line:sub(cursor[2] + 1, cursor[2] + 1)
  local before_cursor = line:sub(1, cursor[2])

  if pair_options.markdown and opening == '`' and vim.bo.filetype == 'markdown' and before_cursor:match '^%s*``' then
    return '`\n```' .. vim.api.nvim_replace_termcodes('<Up>', true, true, true)
  end

  if pair_options.skip_next and next_character ~= '' and next_character:match(pair_options.skip_next) then return opening end

  if pair_options.skip_ts then
    local ok, captures = pcall(vim.treesitter.get_captures_at_pos, 0, cursor[1] - 1, math.max(cursor[2] - 1, 0))
    for _, capture in ipairs(ok and captures or {}) do
      if vim.tbl_contains(pair_options.skip_ts, capture.capture) then return opening end
    end
  end

  if pair_options.skip_unbalanced and next_character == closing and closing ~= opening then
    local _, opening_count = line:gsub(vim.pesc(opening), '')
    local _, closing_count = line:gsub(vim.pesc(closing), '')
    if closing_count > opening_count then return opening end
  end

  return open_pair(pair, neigh_pattern)
end

vim.keymap.set('n', '<leader>up', function()
  vim.g.minipairs_disable = not vim.g.minipairs_disable
  vim.notify('Mini pairs: ' .. (vim.g.minipairs_disable and 'disabled' or 'enabled'))
end, { desc = 'Toggle Mini Pairs' })

require('mini.ai').setup({
  -- Avoid conflicts with built-in incremental selection on Neovim>=0.12
  mappings = {
    around_next = 'aa',
    inside_next = 'ii',
  },
  n_lines = 500,
})

require('mini.surround').setup()
