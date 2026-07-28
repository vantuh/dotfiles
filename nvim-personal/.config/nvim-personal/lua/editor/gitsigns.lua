vim.pack.add { 'https://github.com/lewis6991/gitsigns.nvim' }

require('gitsigns').setup {
  signs = {
    add = { text = '▎' },
    change = { text = '▎' },
    delete = { text = '' },
    topdelete = { text = '' },
    changedelete = { text = '▎' },
    untracked = { text = '▎' },
  },
  signs_staged = {
    add = { text = '▎' },
    change = { text = '▎' },
    delete = { text = '' },
    topdelete = { text = '' },
    changedelete = { text = '▎' },
  },
  current_line_blame = true,
  current_line_blame_opts = {
    delay = 500,
    virt_text_pos = 'eol',
    ignore_whitespace = true,
  },
  current_line_blame_formatter = ' <author>, <author_time:%R> • <summary>',
  on_attach = function(bufnr)
    local gitsigns = require 'gitsigns'

    local function map(mode, l, r, opts)
      opts = opts or {}
      opts.buffer = bufnr
      vim.keymap.set(mode, l, r, opts)
    end

    -- Navigation
    map('n', ']h', function()
      if vim.wo.diff then
        vim.cmd.normal { ']c', bang = true }
      else
        gitsigns.nav_hunk 'next'
      end
    end, { desc = 'Next Git Hunk' })

    map('n', '[h', function()
      if vim.wo.diff then
        vim.cmd.normal { '[c', bang = true }
      else
        gitsigns.nav_hunk 'prev'
      end
    end, { desc = 'Previous Git Hunk' })

    map('n', ']H', function() gitsigns.nav_hunk 'last' end, { desc = 'Last Git Hunk' })
    map('n', '[H', function() gitsigns.nav_hunk 'first' end, { desc = 'First Git Hunk' })

    -- Actions (LazyVim-compatible <leader>gh… namespace)
    map('v', '<leader>ghs', function() gitsigns.stage_hunk { vim.fn.line '.', vim.fn.line 'v' } end, { desc = 'git [s]tage hunk' })
    map('v', '<leader>ghr', function() gitsigns.reset_hunk { vim.fn.line '.', vim.fn.line 'v' } end, { desc = 'git [r]eset hunk' })
    map('n', '<leader>ghs', gitsigns.stage_hunk, { desc = 'git [s]tage hunk' })
    map('n', '<leader>ghr', gitsigns.reset_hunk, { desc = 'git [r]eset hunk' })
    map('n', '<leader>ghS', gitsigns.stage_buffer, { desc = 'git [S]tage buffer' })
    map('n', '<leader>ghR', gitsigns.reset_buffer, { desc = 'git [R]eset buffer' })
    map('n', '<leader>ghp', gitsigns.preview_hunk, { desc = 'git [p]review hunk' })
    map('n', '<leader>ghi', gitsigns.preview_hunk_inline, { desc = 'git preview hunk [i]nline' })
    map('n', '<leader>ghb', function() gitsigns.blame_line { full = true } end, { desc = 'git [b]lame line' })
    map('n', '<leader>ghd', gitsigns.diffthis, { desc = 'git [d]iff against index' })
    map('n', '<leader>ghD', function() gitsigns.diffthis '@' end, { desc = 'git [D]iff against last commit' })
    map('n', '<leader>ghQ', function() gitsigns.setqflist 'all' end, { desc = 'git hunk [Q]uickfix list (all files in repo)' })
    map('n', '<leader>ghq', gitsigns.setqflist, { desc = 'git hunk [q]uickfix list (all changes in this file)' })

    -- Toggles
    map('n', '<leader>tb', gitsigns.toggle_current_line_blame, { desc = '[T]oggle git show [b]lame line' })
    map('n', '<leader>tw', gitsigns.toggle_word_diff, { desc = '[T]oggle git intra-line [w]ord diff' })

    -- Text object
    map({ 'o', 'x' }, 'ih', gitsigns.select_hunk)
  end,
}
