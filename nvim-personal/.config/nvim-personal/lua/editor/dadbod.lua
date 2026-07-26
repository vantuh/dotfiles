-- Database UI and SQL execution. Connections are configured separately through vim.g.dbs.

vim.g.omni_sql_default_compl_type = 'syntax' -- Keep SQL keywords without Neovim's legacy completion plugin.
vim.g.loaded_sql_completion = true -- Prevent the legacy SQL completion plugin from conflicting with Blink.

local data_path = vim.fn.stdpath 'data'
vim.g.db_ui_auto_execute_table_helpers = 1
vim.g.db_ui_save_location = data_path .. '/dadbod_ui'
vim.g.db_ui_show_database_icon = true
vim.g.db_ui_tmp_query_location = data_path .. '/dadbod_ui/tmp'
vim.g.db_ui_use_nerd_fonts = true
vim.g.db_ui_use_nvim_notify = true
vim.g.db_ui_execute_on_save = false -- Never execute a query merely because its buffer was saved.

vim.pack.add {
  'https://github.com/tpope/vim-dadbod',
  'https://github.com/kristijanhusak/vim-dadbod-completion',
  'https://github.com/kristijanhusak/vim-dadbod-ui',
}

vim.keymap.set('n', '<leader>D', '<cmd>DBUIToggle<CR>', { desc = 'Toggle Database UI' })
