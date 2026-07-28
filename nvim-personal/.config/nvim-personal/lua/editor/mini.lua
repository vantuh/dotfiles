-- mini.nvim modules (statusline lives in ui/lualine.lua instead).

vim.pack.add { 'https://github.com/nvim-mini/mini.nvim' }

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
  if vim.fn.getcmdline() ~= '' then
    return open_pair(pair, neigh_pattern)
  end

  local opening, closing = pair:sub(1, 1), pair:sub(2, 2)
  local line = vim.api.nvim_get_current_line()
  local cursor = vim.api.nvim_win_get_cursor(0)
  local next_character = line:sub(cursor[2] + 1, cursor[2] + 1)
  local before_cursor = line:sub(1, cursor[2])

  if pair_options.markdown and opening == '`' and vim.bo.filetype == 'markdown' and before_cursor:match '^%s*``' then
    return '`\n```' .. vim.api.nvim_replace_termcodes('<Up>', true, true, true)
  end

  if pair_options.skip_next and next_character ~= '' and next_character:match(pair_options.skip_next) then
    return opening
  end

  if pair_options.skip_ts then
    local ok, captures = pcall(vim.treesitter.get_captures_at_pos, 0, cursor[1] - 1, math.max(cursor[2] - 1, 0))
    for _, capture in ipairs(ok and captures or {}) do
      if vim.tbl_contains(pair_options.skip_ts, capture.capture) then
        return opening
      end
    end
  end

  if pair_options.skip_unbalanced and next_character == closing and closing ~= opening then
    local _, opening_count = line:gsub(vim.pesc(opening), '')
    local _, closing_count = line:gsub(vim.pesc(closing), '')
    if closing_count > opening_count then
      return opening
    end
  end

  return open_pair(pair, neigh_pattern)
end

vim.keymap.set('n', '<leader>up', function()
  vim.g.minipairs_disable = not vim.g.minipairs_disable
  vim.notify('Mini pairs: ' .. (vim.g.minipairs_disable and 'disabled' or 'enabled'))
end, { desc = 'Toggle Mini Pairs' })

require('mini.ai').setup {
  -- Avoid conflicts with built-in incremental selection on Neovim>=0.12
  mappings = {
    around_next = 'aa',
    inside_next = 'ii',
  },
  n_lines = 500,
  custom_textobjects = {
    -- block (conditional/loop)
    o = require('mini.ai').gen_spec.treesitter {
      a = { '@block.outer', '@conditional.outer', '@loop.outer' },
      i = { '@block.inner', '@conditional.inner', '@loop.inner' },
    },
    -- function
    f = require('mini.ai').gen_spec.treesitter { a = '@function.outer', i = '@function.inner' },
    -- class
    c = require('mini.ai').gen_spec.treesitter { a = '@class.outer', i = '@class.inner' },
    -- tag
    t = { '<(%w-)%f[^<%w][^<>]->.-</%1>', '^<.->().*()</[^/]->$' },
    -- digit sequence
    d = { '%f[%d]%d+' },
    -- case-sensitive word (camelCase, PascalCase, snake_case segment)
    e = {
      { '%u[%l%d]+%f[^%l%d]', '%f[%S][%l%d]+%f[^%l%d]', '%f[%P][%l%d]+%f[^%l%d]', '^[%l%d]+%f[^%l%d]' },
      '^().*()$',
    },
    -- whole buffer
    g = function()
      local from = { line = 1, col = 1 }
      local to = { line = vim.fn.line '$', col = math.max(vim.fn.getline('$'):len(), 1) }
      return { from = from, to = to }
    end,
    -- function call (with dot in name, e.g. vim.fn.foo)
    u = require('mini.ai').gen_spec.function_call(),
    -- function call without dot (e.g. foo, _bar)
    U = require('mini.ai').gen_spec.function_call { name_pattern = '[%w_]' },
  },
}

require('mini.surround').setup()
