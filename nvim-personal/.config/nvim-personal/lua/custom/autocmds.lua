-- LazyVim-style core autocmds.

local function augroup(name)
  return vim.api.nvim_create_augroup('custom-' .. name, { clear = true })
end

-- Reload files changed outside of Neovim.
vim.api.nvim_create_autocmd({ 'FocusGained', 'TermClose', 'TermLeave' }, {
  group = augroup('checktime'),
  callback = function()
    if vim.o.buftype ~= 'nofile' then vim.cmd 'checktime' end
  end,
})

-- Highlight text after yanking it.
vim.api.nvim_create_autocmd('TextYankPost', {
  group = augroup('highlight-yank'),
  callback = function() vim.hl.on_yank() end,
})

-- Keep splits balanced after resizing Neovim.
vim.api.nvim_create_autocmd('VimResized', {
  group = augroup('resize-splits'),
  callback = function()
    local current_tab = vim.fn.tabpagenr()
    vim.cmd 'tabdo wincmd ='
    vim.cmd('tabnext ' .. current_tab)
  end,
})

-- Return to the last cursor position when reopening a file.
vim.api.nvim_create_autocmd('BufReadPost', {
  group = augroup('last-location'),
  callback = function(event)
    local buf = event.buf
    if vim.bo[buf].filetype == 'gitcommit' or vim.b[buf].custom_last_location then return end

    vim.b[buf].custom_last_location = true
    local mark = vim.api.nvim_buf_get_mark(buf, '"')
    local line_count = vim.api.nvim_buf_line_count(buf)
    if mark[1] > 0 and mark[1] <= line_count then pcall(vim.api.nvim_win_set_cursor, 0, mark) end
  end,
})

-- Close temporary utility buffers with q.
vim.api.nvim_create_autocmd('FileType', {
  group = augroup('close-with-q'),
  pattern = {
    'PlenaryTestPopup',
    'checkhealth',
    'dap-float',
    'dbout',
    'gitsigns-blame',
    'grug-far',
    'help',
    'lspinfo',
    'neotest-output',
    'neotest-output-panel',
    'neotest-summary',
    'notify',
    'qf',
    'spectre_panel',
    'startuptime',
    'tsplayground',
  },
  callback = function(event)
    vim.bo[event.buf].buflisted = false
    vim.schedule(function()
      if not vim.api.nvim_buf_is_valid(event.buf) then return end
      vim.keymap.set('n', 'q', function()
        vim.cmd 'close'
        pcall(vim.api.nvim_buf_delete, event.buf, { force = true })
      end, {
        buffer = event.buf,
        silent = true,
        desc = 'Quit buffer',
      })
    end)
  end,
})

-- Keep inline man pages out of the buffer list.
vim.api.nvim_create_autocmd('FileType', {
  group = augroup('man-unlisted'),
  pattern = 'man',
  callback = function(event) vim.bo[event.buf].buflisted = false end,
})

-- Wrap prose and enable spelling assistance.
vim.api.nvim_create_autocmd('FileType', {
  group = augroup('wrap-spell'),
  pattern = { 'text', 'plaintex', 'typst', 'gitcommit', 'markdown' },
  callback = function()
    vim.opt_local.wrap = true
    vim.opt_local.spell = true
  end,
})

-- Never conceal JSON syntax.
vim.api.nvim_create_autocmd('FileType', {
  group = augroup('json-conceal'),
  pattern = { 'json', 'jsonc', 'json5' },
  callback = function() vim.opt_local.conceallevel = 0 end,
})

-- Create missing parent directories when saving a file.
vim.api.nvim_create_autocmd('BufWritePre', {
  group = augroup('auto-create-directory'),
  callback = function(event)
    if event.match:match '^%w%w+:[\\/][\\/]' then return end

    local file = vim.uv.fs_realpath(event.match) or event.match
    vim.fn.mkdir(vim.fn.fnamemodify(file, ':p:h'), 'p')
  end,
})
