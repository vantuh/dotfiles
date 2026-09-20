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
    end, { desc = 'Next Hunk' })

    map('n', '[h', function()
      if vim.wo.diff then
        vim.cmd.normal { '[c', bang = true }
      else
        gitsigns.nav_hunk 'prev'
      end
    end, { desc = 'Prev Hunk' })

    map('n', ']H', function()
      gitsigns.nav_hunk 'last'
    end, { desc = 'Last Hunk' })
    map('n', '[H', function()
      gitsigns.nav_hunk 'first'
    end, { desc = 'First Hunk' })

    -- Actions (LazyVim-compatible <leader>gh… namespace)
    map('v', '<leader>ghs', function()
      gitsigns.stage_hunk { vim.fn.line '.', vim.fn.line 'v' }
    end, { desc = 'Stage Hunk' })
    map('v', '<leader>ghr', function()
      gitsigns.reset_hunk { vim.fn.line '.', vim.fn.line 'v' }
    end, { desc = 'Reset Hunk' })
    map('n', '<leader>ghs', gitsigns.stage_hunk, { desc = 'Stage Hunk' })
    map('n', '<leader>ghr', gitsigns.reset_hunk, { desc = 'Reset Hunk' })
    map('n', '<leader>ghS', gitsigns.stage_buffer, { desc = 'Stage Buffer' })
    map('n', '<leader>ghR', gitsigns.reset_buffer, { desc = 'Reset Buffer' })
    map('n', '<leader>ghp', gitsigns.preview_hunk, { desc = 'Preview Hunk' })
    map('n', '<leader>ghi', gitsigns.preview_hunk_inline, { desc = 'Preview Hunk Inline' })
    map('n', '<leader>ghb', function()
      gitsigns.blame_line { full = true }
    end, { desc = 'Blame Line' })
    map('n', '<leader>ghd', gitsigns.diffthis, { desc = 'Diff This' })
    map('n', '<leader>ghD', function()
      gitsigns.diffthis '@'
    end, { desc = 'Diff This ~' })
    map('n', '<leader>ghQ', function()
      gitsigns.setqflist 'all'
    end, { desc = 'Hunk Quickfix (all files)' })
    map('n', '<leader>ghq', gitsigns.setqflist, { desc = 'Hunk Quickfix (buffer)' })

    -- Toggles (UI group)
    map('n', '<leader>uB', gitsigns.toggle_current_line_blame, { desc = 'Toggle Blame Line' })
    map('n', '<leader>uW', gitsigns.toggle_word_diff, { desc = 'Toggle Word Diff' })

    -- Text object
    map({ 'o', 'x' }, 'ih', gitsigns.select_hunk)
  end,
}
