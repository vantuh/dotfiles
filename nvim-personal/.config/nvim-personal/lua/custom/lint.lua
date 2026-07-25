vim.pack.add { 'https://github.com/mfussenegger/nvim-lint' }

local lint = require 'lint'

lint.linters_by_ft = {
  dockerfile = { 'hadolint' },
  fish = { 'fish' },
  go = { 'golangcilint' },
  markdown = { 'markdownlint-cli2' },
  mysql = { 'sqlfluff' },
  plsql = { 'sqlfluff' },
  sql = { 'sqlfluff' },
  terraform = { 'terraform_validate' },
  tf = { 'terraform_validate' },
}

local timer = assert(vim.uv.new_timer())
local function run_linter(event)
  local buf = event.buf
  timer:stop()
  timer:start(100, 0, vim.schedule_wrap(function()
    if not vim.api.nvim_buf_is_valid(buf) then return end
    vim.api.nvim_buf_call(buf, function() lint.try_lint() end)
  end))
end

vim.api.nvim_create_autocmd({ 'BufReadPost', 'BufWritePost', 'InsertLeave' }, {
  group = vim.api.nvim_create_augroup('custom-nvim-lint', { clear = true }),
  callback = run_linter,
})
