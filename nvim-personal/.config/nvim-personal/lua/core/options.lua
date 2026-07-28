-- Core Neovim options. This file must load before plugin configuration.

vim.loader.enable() -- Cache Lua modules to make startup and require() calls faster.

-- Leader keys must be defined before plugins create their keymaps.
vim.g.mapleader = ' ' -- Use Space as the main leader key.
vim.g.maplocalleader = '\\' -- Use Backslash as the filetype-specific local leader key.

vim.g.have_nerd_font = true -- Tell the config that the terminal can display Nerd Font icons.
vim.g.autoformat = true -- Enable automatic formatting on save by default.
vim.g.snacks_animate = true -- Allow animations provided by Snacks.nvim.

-- Snacks explorer replaces netrw; skip shipping its startup cost.
vim.g.loaded_netrw = 1
vim.g.loaded_netrwPlugin = 1


local opt = vim.opt -- Short alias used for setting Neovim options below.

opt.autowrite = true -- Automatically save modified files before commands that switch buffers or run tools.
opt.breakindent = true -- Keep wrapped lines visually aligned with the indentation of the original line.
opt.completeopt = 'menu,menuone,noselect' -- Always show completion as a menu without selecting an item automatically.
opt.conceallevel = 2 -- Hide markup characters when a syntax plugin provides a cleaner visual replacement.
opt.confirm = true -- Ask whether to save changes instead of failing when closing a modified file.
opt.cursorline = true -- Highlight the screen line containing the cursor.
opt.expandtab = true -- Insert spaces when the Tab key is pressed.
opt.fillchars = { -- Customize characters used for diffs and empty lines.
  diff = '╱', -- Character shown for deleted lines in diff mode.
  eob = ' ', -- Hide the ~ characters below the end of a buffer.
}
opt.foldenable = false -- Keep code folding completely disabled.
opt.foldcolumn = '0' -- Do not reserve a column for fold controls or icons.
opt.formatexpr = "v:lua.require'conform'.formatexpr()" -- Let Conform format text used by the gq operator.
opt.formatoptions = 'jcroqlnt' -- Configure sensible automatic comment and text formatting behavior.
opt.grepformat = '%f:%l:%c:%m' -- Tell Neovim how to parse file, line, column, and message from grep results.
opt.grepprg = 'rg --vimgrep' -- Use ripgrep for the built-in :grep command.
opt.ignorecase = true -- Make searches case-insensitive when the query contains only lowercase letters.
opt.inccommand = 'nosplit' -- Preview substitutions directly in the current buffer while typing :substitute.
opt.jumpoptions = 'view' -- Restore the previous window view when moving through the jump list.
opt.laststatus = 3 -- Use one global statusline for all windows.
opt.linebreak = true -- Wrap long lines at word boundaries instead of splitting words.
opt.list = true -- Display configured symbols for tabs, trailing spaces, and special whitespace.
opt.listchars = { tab = '» ', trail = '·', nbsp = '␣' } -- Choose the symbols used to display invisible whitespace.
opt.mouse = 'a' -- Enable mouse support in every Neovim mode.
opt.number = true -- Show absolute line numbers.
opt.pumblend = 10 -- Make completion popup menus slightly transparent.
opt.pumheight = 10 -- Show at most ten entries in a completion popup.
opt.relativenumber = true -- Show line distances from the cursor while keeping the current line absolute.
opt.ruler = false -- Hide the built-in cursor position ruler because lualine already displays it.
opt.scrolloff = 4 -- Keep at least four visible lines above and below the cursor.
opt.sessionoptions = { -- Define which editor state persistence.nvim stores in sessions.
  'buffers', -- Save the list of open buffers.
  'curdir', -- Save the current working directory.
  'tabpages', -- Save tab pages.
  'winsize', -- Save window sizes.
  'help', -- Save open help windows.
  'globals', -- Save global variables that use uppercase names.
  'skiprtp', -- Do not store runtimepath and packpath values in sessions.
}
opt.shiftround = true -- Round indentation changes to multiples of shiftwidth.
opt.shiftwidth = 2 -- Add or remove two spaces for each indentation level.
opt.shortmess:append { W = true, I = true, c = true, C = true } -- Hide noisy write, intro, and completion messages.
opt.showmode = false -- Hide the current mode because lualine already shows it.
opt.sidescrolloff = 8 -- Keep at least eight columns visible to the left and right of the cursor.
opt.signcolumn = 'yes' -- Always reserve space for diagnostics and Git signs to prevent text from shifting.
opt.smartcase = true -- Make a search case-sensitive when its query contains an uppercase letter.
opt.smartindent = true -- Automatically add indentation when starting structurally nested lines.
opt.smoothscroll = true -- Scroll wrapped lines by screen rows instead of jumping by whole file lines.
opt.spelllang = { 'en' } -- Use the English dictionary when spell checking is enabled.
opt.splitbelow = true -- Open horizontal splits below the current window.
opt.splitkeep = 'screen' -- Preserve visible text positions when splits are opened or resized.
opt.splitright = true -- Open vertical splits to the right of the current window.
opt.tabstop = 2 -- Display a real tab character as two columns wide.
opt.termguicolors = true -- Enable full 24-bit terminal colors.
opt.timeoutlen = 300 -- Wait 300 ms for the next key in a mapping sequence.
opt.undofile = true -- Persist undo history after a file is closed.
opt.undolevels = 10000 -- Keep up to ten thousand undo changes in memory.
opt.updatetime = 200 -- Trigger CursorHold and write swap data after 200 ms of inactivity.
opt.virtualedit = 'block' -- Allow the cursor to move past line endings in visual block mode.
opt.wildmode = 'longest:full,full' -- Complete the longest command match first, then show all matches.
opt.wildoptions = 'pum' -- Display command-line completion matches in a popup menu.
opt.winminwidth = 5 -- Prevent normal windows from becoming narrower than five columns.
opt.wrap = false -- Keep long lines on one screen row unless wrapping is enabled locally.
opt.cmdheight = 0 -- Hide the command/message row because Noice and Snacks display that information.
opt.showcmd = true -- Show partial commands in the last line (relevant with cmdheight=0 via Noice).
opt.showcmdloc = 'last' -- Display partial commands in the last line of the screen.

-- Initialize the system clipboard later because detecting a clipboard provider can slow startup.
vim.schedule(function()
  opt.clipboard = vim.env.SSH_CONNECTION and '' or 'unnamedplus' -- Use the OS clipboard locally but preserve OSC 52 behavior over SSH.
end)

vim.g.markdown_recommended_style = 0 -- Prevent Neovim's Markdown runtime from overriding the configured indentation.
vim.filetype.add { extension = { mdx = 'markdown.mdx' } } -- Detect .mdx files before filetype-based plugins load.
