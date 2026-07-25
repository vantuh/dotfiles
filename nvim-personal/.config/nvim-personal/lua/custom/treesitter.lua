vim.pack.add({
  { src = 'https://github.com/nvim-treesitter/nvim-treesitter', version = 'main' },
  { src = 'https://github.com/nvim-treesitter/nvim-treesitter-textobjects', version = 'main' },
  'https://github.com/windwp/nvim-ts-autotag',
  'https://github.com/folke/ts-comments.nvim',
})

require('nvim-ts-autotag').setup({})
require('ts-comments').setup({})
require('nvim-treesitter-textobjects').setup({ move = { set_jumps = true } })

local textobject_moves = {
  goto_next_start = { [']f'] = '@function.outer', [']c'] = '@class.outer', [']a'] = '@parameter.inner' },
  goto_next_end = { [']F'] = '@function.outer', [']C'] = '@class.outer', [']A'] = '@parameter.inner' },
  goto_previous_start = { ['[f'] = '@function.outer', ['[c'] = '@class.outer', ['[a'] = '@parameter.inner' },
  goto_previous_end = { ['[F'] = '@function.outer', ['[C'] = '@class.outer', ['[A'] = '@parameter.inner' },
}

local function attach_textobject_moves(buf)
  for method, keymaps in pairs(textobject_moves) do
    for key, query in pairs(keymaps) do
      local object = query:gsub('@', ''):gsub('%..*', '')
      object = object:sub(1, 1):upper() .. object:sub(2)
      local direction = key:sub(1, 1) == '[' and 'Previous' or 'Next'
      local position = key:sub(2, 2) == key:sub(2, 2):upper() and ' End' or ' Start'

      vim.keymap.set({ 'n', 'x', 'o' }, key, function()
        if vim.wo.diff and key:find '[cC]' then return vim.cmd.normal { key, bang = true } end
        require('nvim-treesitter-textobjects.move')[method](query, 'textobjects')
      end, {
        buffer = buf,
        silent = true,
        desc = direction .. ' ' .. object .. position,
      })
    end
  end
end

local parsers = { 'bash', 'c', 'diff', 'html', 'lua', 'luadoc', 'markdown', 'markdown_inline', 'query', 'vim', 'vimdoc' }
require('nvim-treesitter').install(parsers)

---@param buf integer
---@param language string
local function treesitter_try_attach(buf, language)
  if not vim.treesitter.language.add(language) then return end
  vim.treesitter.start(buf, language)

  local has_textobject_query = vim.treesitter.query.get(language, 'textobjects') ~= nil
  if has_textobject_query then attach_textobject_moves(buf) end

  local has_indent_query = vim.treesitter.query.get(language, 'indents') ~= nil
  if has_indent_query then
    vim.bo.indentexpr = "v:lua.require'nvim-treesitter'.indentexpr()"
  end
end

local available_parsers = require('nvim-treesitter').get_available()

local function attach_for_filetype(args)
  local buf, filetype = args.buf, args.match
  local language = vim.treesitter.language.get_lang(filetype)
  if not language then return end

  local installed_parsers = require('nvim-treesitter').get_installed('parsers')
  if vim.tbl_contains(installed_parsers, language) then
    treesitter_try_attach(buf, language)
  elseif vim.tbl_contains(available_parsers, language) then
    require('nvim-treesitter').install(language):await(function() treesitter_try_attach(buf, language) end)
  else
    treesitter_try_attach(buf, language)
  end
end

vim.api.nvim_create_autocmd('FileType', { callback = attach_for_filetype })

-- Module loads after VimEnter (and after persistence session restore), so FileType already
-- fired for restored buffers. Attach to every loaded filetyped buffer, not just the current one.
for _, buf in ipairs(vim.api.nvim_list_bufs()) do
  if vim.api.nvim_buf_is_loaded(buf) then
    local filetype = vim.bo[buf].filetype
    if filetype ~= '' then attach_for_filetype({ buf = buf, match = filetype }) end
  end
end
