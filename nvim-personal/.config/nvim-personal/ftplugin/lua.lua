-- Buffer-local maps for Lua files (auto-sourced by Neovim on FileType).

vim.keymap.set({ 'n', 'x' }, '<localleader>r', function() Snacks.debug.run() end, { buffer = true, desc = 'Run Lua' })
