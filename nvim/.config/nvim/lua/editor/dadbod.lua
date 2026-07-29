-- SQL schema-aware completion via dadbod (no DBUI / connection sidebar).
-- Completions need a connection URL: g:db, b:db, or $DATABASE_URL.

vim.g.omni_sql_default_compl_type = 'syntax'
vim.g.loaded_sql_completion = true -- avoid legacy SQL omnifunc fighting Blink

vim.pack.add {
  'https://github.com/tpope/vim-dadbod',
  'https://github.com/kristijanhusak/vim-dadbod-completion',
}
