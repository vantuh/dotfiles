-- Basic keymaps, diagnostics, and core autocmds (no plugins).

vim.keymap.set({ 'i', 'n', 's' }, '<Esc>', function()
  vim.cmd 'nohlsearch'
  local ok, luasnip = pcall(require, 'luasnip')
  if ok and luasnip.session.current_nodes[vim.api.nvim_get_current_buf()] then
    luasnip.unlink_current()
  end
  return '<Esc>'
end, { expr = true, desc = 'Escape and clear search' })
vim.keymap.set('i', 'jj', '<Esc>', { desc = 'Exit insert mode' })

-- Navigate wrapped lines by their visual position unless a count is given.
vim.keymap.set({ 'n', 'x' }, 'j', "v:count == 0 ? 'gj' : 'j'", { expr = true, silent = true, desc = 'Down' })
vim.keymap.set({ 'n', 'x' }, '<Down>', "v:count == 0 ? 'gj' : 'j'", { expr = true, silent = true, desc = 'Down' })
vim.keymap.set({ 'n', 'x' }, 'k', "v:count == 0 ? 'gk' : 'k'", { expr = true, silent = true, desc = 'Up' })
vim.keymap.set({ 'n', 'x' }, '<Up>', "v:count == 0 ? 'gk' : 'k'", { expr = true, silent = true, desc = 'Up' })

-- Resize windows.
vim.keymap.set('n', '<C-Up>', '<cmd>resize +2<CR>', { desc = 'Increase window height' })
vim.keymap.set('n', '<C-Down>', '<cmd>resize -2<CR>', { desc = 'Decrease window height' })
vim.keymap.set('n', '<C-Left>', '<cmd>vertical resize -2<CR>', { desc = 'Decrease window width' })
vim.keymap.set('n', '<C-Right>', '<cmd>vertical resize +2<CR>', { desc = 'Increase window width' })

-- Move lines.
vim.keymap.set('n', '<A-j>', "<cmd>execute 'move .+' . v:count1<CR>==", { desc = 'Move down' })
vim.keymap.set('n', '<A-k>', "<cmd>execute 'move .-' . (v:count1 + 1)<CR>==", { desc = 'Move up' })
vim.keymap.set('i', '<A-j>', '<Esc><cmd>move .+1<CR>==gi', { desc = 'Move down' })
vim.keymap.set('i', '<A-k>', '<Esc><cmd>move .-2<CR>==gi', { desc = 'Move up' })
vim.keymap.set('x', '<A-j>', ":<C-u>execute \"'<,'>move '>+\" . v:count1<CR>gv=gv", { desc = 'Move down' })
vim.keymap.set('x', '<A-k>', ":<C-u>execute \"'<,'>move '<-\" . (v:count1 + 1)<CR>gv=gv", { desc = 'Move up' })

-- Search, undo, save, and indentation behavior.
vim.keymap.set('n', '<leader>ur', '<cmd>nohlsearch<Bar>diffupdate<Bar>normal! <C-L><CR>', { desc = 'Redraw and clear search' })
vim.keymap.set('n', 'n', "'Nn'[v:searchforward].'zv'", { expr = true, desc = 'Next search result' })
vim.keymap.set({ 'x', 'o' }, 'n', "'Nn'[v:searchforward]", { expr = true, desc = 'Next search result' })
vim.keymap.set('n', 'N', "'nN'[v:searchforward].'zv'", { expr = true, desc = 'Previous search result' })
vim.keymap.set({ 'x', 'o' }, 'N', "'nN'[v:searchforward]", { expr = true, desc = 'Previous search result' })
vim.keymap.set('i', ',', ',<C-g>u')
vim.keymap.set('i', '.', '.<C-g>u')
vim.keymap.set('i', ';', ';<C-g>u')
vim.keymap.set({ 'i', 'x', 'n', 's' }, '<C-s>', '<cmd>write<CR><Esc>', { desc = 'Save file' })
vim.keymap.set('x', '<', '<gv')
vim.keymap.set('x', '>', '>gv')
vim.keymap.set('n', 'gco', 'o<Esc>Vcx<Esc><cmd>normal gcc<CR>fxa<BS>', { desc = 'Add comment below' })
vim.keymap.set('n', 'gcO', 'O<Esc>Vcx<Esc><cmd>normal gcc<CR>fxa<BS>', { desc = 'Add comment above' })
vim.keymap.set('n', '<leader>fn', '<cmd>enew<CR>', { desc = 'New file' })

vim.diagnostic.config {
  update_in_insert = false,
  severity_sort = true,
  float = { border = 'rounded', source = 'if_many' },
  underline = true,
  virtual_text = {
    spacing = 4,
    source = 'if_many',
    prefix = '●',
  },
  signs = {
    text = {
      [vim.diagnostic.severity.ERROR] = ' ',
      [vim.diagnostic.severity.WARN] = ' ',
      [vim.diagnostic.severity.HINT] = ' ',
      [vim.diagnostic.severity.INFO] = ' ',
    },
  },
  virtual_lines = false,
  jump = {
    on_jump = function(_, bufnr)
      vim.diagnostic.open_float {
        bufnr = bufnr,
        scope = 'cursor',
        focus = false,
      }
    end,
  },
}

local function diagnostic_goto(next, severity)
  return function()
    vim.diagnostic.jump {
      count = (next and 1 or -1) * vim.v.count1,
      severity = severity and vim.diagnostic.severity[severity] or nil,
      float = true,
    }
  end
end

vim.keymap.set('n', '<leader>cd', vim.diagnostic.open_float, { desc = 'Line Diagnostics' })
vim.keymap.set('n', ']d', diagnostic_goto(true), { desc = 'Next Diagnostic' })
vim.keymap.set('n', '[d', diagnostic_goto(false), { desc = 'Prev Diagnostic' })
vim.keymap.set('n', ']e', diagnostic_goto(true, 'ERROR'), { desc = 'Next Error' })
vim.keymap.set('n', '[e', diagnostic_goto(false, 'ERROR'), { desc = 'Prev Error' })
vim.keymap.set('n', ']w', diagnostic_goto(true, 'WARN'), { desc = 'Next Warning' })
vim.keymap.set('n', '[w', diagnostic_goto(false, 'WARN'), { desc = 'Prev Warning' })

vim.keymap.set('n', '<leader>xl', function()
  local open = vim.fn.getloclist(0, { winid = 0 }).winid ~= 0
  local ok, err = pcall(open and vim.cmd.lclose or vim.cmd.lopen)
  if not ok then
    vim.notify(err, vim.log.levels.ERROR)
  end
end, { desc = 'Location list' })

vim.keymap.set('n', '<leader>xq', function()
  local open = vim.fn.getqflist({ winid = 0 }).winid ~= 0
  local ok, err = pcall(open and vim.cmd.cclose or vim.cmd.copen)
  if not ok then
    vim.notify(err, vim.log.levels.ERROR)
  end
end, { desc = 'Quickfix list' })
vim.keymap.set('n', '<leader>qq', '<cmd>qa<CR>', { desc = 'Quit All' })
vim.keymap.set('t', '<Esc><Esc>', '<C-\\><C-n>', { desc = 'Exit terminal mode' })

vim.keymap.set('n', '<C-h>', '<C-w><C-h>', { desc = 'Move focus to the left window' })
vim.keymap.set('n', '<C-l>', '<C-w><C-l>', { desc = 'Move focus to the right window' })
vim.keymap.set('n', '<C-j>', '<C-w><C-j>', { desc = 'Move focus to the lower window' })
vim.keymap.set('n', '<C-k>', '<C-w><C-k>', { desc = 'Move focus to the upper window' })

-- Windows.
vim.keymap.set('n', '<leader>-', '<C-w>s', { remap = true, desc = 'Split window below' })
vim.keymap.set('n', '<leader>|', '<C-w>v', { remap = true, desc = 'Split window right' })
vim.keymap.set('n', '<leader>wd', '<C-w>c', { remap = true, desc = 'Delete window' })

-- Inspect (plugin-free)
vim.keymap.set('n', '<leader>ui', vim.show_pos, { desc = 'Inspect Position' })
vim.keymap.set('n', '<leader>uI', function()
  vim.treesitter.inspect_tree()
  vim.api.nvim_input 'I'
end, { desc = 'Inspect Tree' })
