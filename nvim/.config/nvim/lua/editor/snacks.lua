-- Snacks.nvim: setup + all Snacks keymaps (explorer, picker, git, terminal, toggles).

vim.pack.add { 'https://github.com/folke/snacks.nvim' }

-- Put "Yes" first in explorer confirm dialogs (move/delete).
vim.schedule(function()
  local ok, util = pcall(require, 'snacks.picker.util')
  if not ok then
    return
  end
  util.confirm = function(prompt, fn)
    Snacks.picker.select({ 'Yes', 'No' }, {
      prompt = prompt,
      snacks = { layout = { layout = { max_width = 60 } } },
    }, function(_, idx)
      if idx == 1 then
        fn()
      end
    end)
  end
end)

require('snacks').setup {
  explorer = { enabled = true },
  lazygit = { enabled = false },
  indent = { enabled = true },
  scope = { enabled = true },
  words = { enabled = true },
  input = { enabled = true },
  bigfile = { enabled = true },
  quickfile = { enabled = true },
  -- Top-right toasts (replaces the bottom message row together with noice + cmdheight=0)
  notifier = {
    enabled = true,
    top_down = true,
    timeout = 3000,
  },
  scroll = {
    animate = {
      duration = { step = 5, total = 80 },
      easing = 'linear',
    },
    animate_repeat = {
      delay = 0,
      duration = { step = 1, total = 0 },
      easing = 'linear',
    },
  },
  terminal = {},
  picker = {
    enabled = true,
    ui_select = true, -- replaces telescope-ui-select for vim.ui.select
    sources = {
      explorer = {
        hidden = true,
        ignored = false,
        layout = {
          preset = 'sidebar',
          preview = 'main',
        },
        on_show = function(picker)
          -- Auto enable preview in explorer
          picker:toggle('preview', { enable = true })
          vim.schedule(function()
            if not picker.closed then
              picker:show_preview()
            end
          end)
          -- Re-enable preview when returning focus to the explorer
          vim.api.nvim_create_autocmd('WinEnter', {
            callback = function()
              if picker.closed then
                return true
              end -- remove autocmd
              if picker:is_focused() then
                picker:toggle('preview', { enable = true })
              end
            end,
          })
        end,
      },
      files = {
        hidden = true,
        ignored = true,
        exclude = { 'node_modules', '.git', 'dist', 'build', '.next', '.nuxt' },
        matcher = {
          frecency = true,
          sort_empty = true,
        },
      },
    },
  },
}

local function git_root()
  return Snacks.git.get_root()
end

-- LazyVim's status column, backed directly by Snacks.
vim.o.statuscolumn = "%!v:lua.require'snacks.statuscolumn'.get()"

-- Explorer / notifications
vim.keymap.set('n', '<leader>e', function()
  Snacks.explorer { cwd = git_root() }
end, { desc = 'File Explorer (Root Dir)' })
vim.keymap.set('n', '<leader>E', function()
  Snacks.explorer { cwd = vim.uv.cwd() }
end, { desc = 'File Explorer (cwd)' })
vim.keymap.set('n', '<leader>n', function()
  if Snacks.config.picker and Snacks.config.picker.enabled then
    Snacks.picker.notifications()
  else
    Snacks.notifier.show_history()
  end
end, { desc = 'Notification History' })
vim.keymap.set('n', '<leader>un', function()
  Snacks.notifier.hide()
end, { desc = 'Dismiss All Notifications' })

-- Find
vim.keymap.set('n', '<leader><space>', function()
  Snacks.picker.files { cwd = git_root() }
end, { desc = 'Find Files (Root Dir)' })
vim.keymap.set('n', '<leader>,', function()
  Snacks.picker.buffers()
end, { desc = 'Buffers' })
vim.keymap.set('n', '<leader>/', function()
  Snacks.picker.grep { cwd = git_root() }
end, { desc = 'Search Text (Root Dir)' })
vim.keymap.set('n', '<leader>ff', function()
  Snacks.picker.files { cwd = git_root() }
end, { desc = 'Find Files (Root Dir)' })
vim.keymap.set('n', '<leader>fF', function()
  Snacks.picker.files()
end, { desc = 'Find Files (cwd)' })
vim.keymap.set('n', '<leader>fg', function()
  Snacks.picker.git_files()
end, { desc = 'Find Files (git-files)' })
vim.keymap.set('n', '<leader>fr', function()
  Snacks.picker.recent()
end, { desc = 'Find Recent Files' })
vim.keymap.set('n', '<leader>fp', function()
  Snacks.picker.projects()
end, { desc = 'Find Projects' })
vim.keymap.set('n', '<leader>fc', function()
  Snacks.picker.files { cwd = vim.fn.stdpath 'config' }
end, { desc = 'Find Config File' })

vim.keymap.set('n', '<leader>:', function()
  Snacks.picker.command_history()
end, { desc = 'Search Command History' })
vim.keymap.set('n', '<leader>fb', function()
  Snacks.picker.buffers()
end, { desc = 'Buffers' })
vim.keymap.set('n', '<leader>fB', function()
  Snacks.picker.buffers { filter = { cwd = true } }
end, { desc = 'Buffers (cwd)' })
vim.keymap.set('n', '<leader>fR', function()
  Snacks.picker.recent { filter = { cwd = true } }
end, { desc = 'Find Recent Files (cwd)' })

-- Search
vim.keymap.set('n', '<leader>sg', function()
  Snacks.picker.grep { cwd = git_root() }
end, { desc = 'Search Text (Root Dir)' })
vim.keymap.set({ 'n', 'x' }, '<leader>sw', function()
  Snacks.picker.grep_word { cwd = git_root() }
end, { desc = 'Search Visual Selection or Word (Root Dir)' })
vim.keymap.set({ 'n', 'x' }, '<leader>sW', function()
  Snacks.picker.grep_word()
end, { desc = 'Search Visual Selection or Word (cwd)' })
vim.keymap.set('n', '<leader>sG', function()
  Snacks.picker.grep()
end, { desc = 'Search Text (cwd)' })
vim.keymap.set('n', '<leader>sb', function()
  Snacks.picker.lines()
end, { desc = 'Buffer Lines' })
vim.keymap.set('n', '<leader>sB', function()
  Snacks.picker.grep_buffers()
end, { desc = 'Search Open Buffers' })
vim.keymap.set('n', '<leader>sm', function()
  Snacks.picker.marks()
end, { desc = 'Find Marks' })
vim.keymap.set('n', '<leader>sj', function()
  Snacks.picker.jumps()
end, { desc = 'Find Jumps' })
vim.keymap.set('n', '<leader>su', function()
  Snacks.picker.undo()
end, { desc = 'UI Undotree' })
vim.keymap.set('n', '<leader>s"', function()
  Snacks.picker.registers()
end, { desc = 'Find Registers' })
vim.keymap.set('n', '<leader>sh', function()
  Snacks.picker.help()
end, { desc = 'Find Help Pages' })
vim.keymap.set('n', '<leader>sH', function()
  Snacks.picker.highlights()
end, { desc = 'Find Highlights' })
vim.keymap.set('n', '<leader>sk', function()
  Snacks.picker.keymaps()
end, { desc = 'Find Keymaps' })
vim.keymap.set('n', '<leader>sc', function()
  Snacks.picker.command_history()
end, { desc = 'Search Command History' })
vim.keymap.set('n', '<leader>sC', function()
  Snacks.picker.commands()
end, { desc = 'Find Commands' })
vim.keymap.set('n', '<leader>sd', function()
  Snacks.picker.diagnostics()
end, { desc = 'Diagnostics' })
vim.keymap.set('n', '<leader>sD', function()
  Snacks.picker.diagnostics_buffer()
end, { desc = 'Buffer Diagnostics' })
vim.keymap.set('n', '<leader>sa', function()
  Snacks.picker.autocmds()
end, { desc = 'Find Autocmds' })
vim.keymap.set('n', '<leader>si', function()
  Snacks.picker.icons()
end, { desc = 'Find Icons' })
vim.keymap.set('n', '<leader>sl', function()
  Snacks.picker.loclist()
end, { desc = 'Diagnostics Location List' })
vim.keymap.set('n', '<leader>sM', function()
  Snacks.picker.man()
end, { desc = 'Find Man Pages' })
vim.keymap.set('n', '<leader>sq', function()
  Snacks.picker.qflist()
end, { desc = 'Diagnostics Quickfix List' })
vim.keymap.set('n', '<leader>s/', function()
  Snacks.picker.search_history()
end, { desc = 'Search History' })
-- <leader>sr is grug-far (Search and Replace); resume uses sR
vim.keymap.set('n', '<leader>sR', function()
  Snacks.picker.resume()
end, { desc = 'Resume' })
vim.keymap.set('n', '<leader>uC', function()
  Snacks.picker.colorschemes()
end, { desc = 'UI Colorschemes' })

-- Git
vim.keymap.set('n', '<leader>gs', function()
  Snacks.picker.git_status()
end, { desc = 'Git Status' })
vim.keymap.set('n', '<leader>gd', function()
  Snacks.picker.git_diff()
end, { desc = 'Git Diff (hunks)' })
vim.keymap.set('n', '<leader>gl', function()
  Snacks.picker.git_log { cwd = git_root() }
end, { desc = 'Git Log' })
vim.keymap.set('n', '<leader>gb', function()
  Snacks.picker.git_log_line()
end, { desc = 'Git Blame Line' })
vim.keymap.set('n', '<leader>gf', function()
  Snacks.picker.git_log_file()
end, { desc = 'Git File History' })
vim.keymap.set('n', '<leader>gL', function()
  Snacks.picker.git_log()
end, { desc = 'Git Log (cwd)' })
vim.keymap.set('n', '<leader>gD', function()
  Snacks.picker.git_diff { staged = false }
end, { desc = 'Git Diff (origin)' })
vim.keymap.set('n', '<leader>gS', function()
  Snacks.picker.git_stash()
end, { desc = 'Git Stash' })
vim.keymap.set({ 'n', 'x' }, '<leader>gB', function()
  Snacks.gitbrowse()
end, { desc = 'Git Browse (open)' })
vim.keymap.set({ 'n', 'x' }, '<leader>gY', function()
  Snacks.gitbrowse {
    open = function(url)
      vim.fn.setreg('+', url)
    end,
    notify = false,
  }
end, { desc = 'Git Browse (copy URL)' })
vim.keymap.set('n', '<leader>gg', function()
  if vim.env.HERDR_ENV ~= '1' then
    vim.notify('Not in Herdr — open lazygit in a terminal tab (lg)', vim.log.levels.WARN)
    return
  end
  local cwd = git_root() or vim.uv.cwd() or vim.fn.getcwd()
  vim.fn.jobstart({ 'herdr-focus-tab', 'lg', '--cwd', cwd, '--', 'lazygit' }, { detach = true })
end, { desc = 'Lazygit (Herdr lg)' })
vim.keymap.set('n', '<leader>gH', function()
  if vim.env.HERDR_ENV ~= '1' then
    vim.notify('Not in Herdr — open hunk in a terminal tab (hunk)', vim.log.levels.WARN)
    return
  end
  local cwd = git_root() or vim.uv.cwd() or vim.fn.getcwd()
  vim.fn.jobstart({
    'herdr-focus-tab',
    'hunk',
    '--cwd',
    cwd,
    '--',
    'hunk',
    'diff',
    '--watch',
  }, { detach = true })
end, { desc = 'Hunk Review (Herdr hunk)' })

-- Toggles
Snacks.toggle.option('spell', { name = 'Spelling' }):map '<leader>us'
Snacks.toggle.option('wrap', { name = 'Wrap' }):map '<leader>uw'
Snacks.toggle.option('relativenumber', { name = 'Relative Number' }):map '<leader>uL'
Snacks.toggle.diagnostics():map '<leader>ud'
Snacks.toggle.line_number():map '<leader>ul'
Snacks.toggle
  .option('conceallevel', {
    off = 0,
    on = vim.o.conceallevel > 0 and vim.o.conceallevel or 2,
    name = 'Conceal Level',
  })
  :map '<leader>uc'
Snacks.toggle
  .option('showtabline', {
    off = 0,
    on = vim.o.showtabline > 0 and vim.o.showtabline or 2,
    name = 'Tabline',
  })
  :map '<leader>uA'
Snacks.toggle.treesitter():map '<leader>uT'
Snacks.toggle.option('background', { off = 'light', on = 'dark', name = 'Dark Background' }):map '<leader>ub'
Snacks.toggle.dim():map '<leader>uD'
Snacks.toggle.animate():map '<leader>ua'
Snacks.toggle.indent():map '<leader>ug'
Snacks.toggle.scroll():map '<leader>uS'
Snacks.toggle.inlay_hints():map '<leader>uh'
Snacks.toggle.zoom():map '<leader>uZ'
Snacks.toggle.zen():map '<leader>uz'
