vim.pack.add { 'https://github.com/mfussenegger/nvim-lint' }

local lint = require 'lint'

lint.linters_by_ft = {
  dockerfile = { 'hadolint' },
  fish = { 'fish' },
  markdown = { 'markdownlint-cli2' },
  mysql = { 'sqlfluff' },
  plsql = { 'sqlfluff' },
  sql = { 'sqlfluff' },
}

-- JS/TS: ESLint LSP when a config exists (same copy-safe detection as lsp.lua);
-- otherwise oxlint. Adding/removing config requires reopening the buffer.
local util = require 'lspconfig.util'
local eslint_config_files = {
  '.eslintrc',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.yaml',
  '.eslintrc.yml',
  '.eslintrc.json',
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'eslint.config.ts',
  'eslint.config.mts',
  'eslint.config.cts',
}

local function has_eslint_config(bufnr)
  local filename = vim.api.nvim_buf_get_name(bufnr)
  if filename == '' then
    return false
  end
  if vim.fs.root(bufnr, { 'deno.json', 'deno.jsonc', 'deno.lock' }) then
    return false
  end
  local root_markers = { 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb', 'bun.lock' }
  root_markers = vim.fn.has 'nvim-0.11.3' == 1 and { root_markers, { '.git' } } or vim.list_extend(root_markers, { '.git' })
  local project_root = vim.fs.root(bufnr, root_markers) or vim.fn.getcwd()
  local markers = util.insert_package_json(vim.list_extend({}, eslint_config_files), 'eslintConfig', filename)
  return vim.fs.find(markers, {
    path = filename,
    type = 'file',
    limit = 1,
    upward = true,
    stop = vim.fs.dirname(project_root),
  })[1] ~= nil
end

local js_ts_ft = {
  javascript = true,
  javascriptreact = true,
  typescript = true,
  typescriptreact = true,
}

local timers = {}

local function close_timer(buf)
  local timer = timers[buf]
  if not timer then
    return
  end
  timers[buf] = nil
  timer:stop()
  timer:close()
end

-- oxlint resolves .eslintignore relative to the process cwd; pin it to the
-- project root so ignores apply regardless of Neovim's current directory.
local function run_oxlint(buf)
  local root = vim.fs.root(buf, { '.oxlintrc.json', '.eslintignore', '.git' })
  lint.try_lint({ 'oxlint' }, { cwd = root })
end

local function run_linter(event)
  local buf = event.buf
  local timer = timers[buf]
  if not timer then
    timer = assert(vim.uv.new_timer())
    timers[buf] = timer
  end
  timer:stop()
  timer:start(
    100,
    0,
    vim.schedule_wrap(function()
      if not vim.api.nvim_buf_is_valid(buf) then
        close_timer(buf)
        return
      end
      vim.api.nvim_buf_call(buf, function()
        if js_ts_ft[vim.bo.filetype] then
          -- oxlint is disk-based; skip InsertLeave before any config scan.
          if event.event == 'InsertLeave' then
            return
          end
          if not has_eslint_config(buf) then
            run_oxlint(buf)
          end
          return
        end
        if event.event == 'InsertLeave' then
          lint.try_lint(nil, { filter = 'stdin' })
          return
        end
        lint.try_lint()
      end)
    end)
  )
end

local lint_group = vim.api.nvim_create_augroup('custom-nvim-lint', { clear = true })

vim.api.nvim_create_autocmd({ 'BufReadPost', 'BufWritePost', 'InsertLeave' }, {
  group = lint_group,
  callback = run_linter,
})

vim.api.nvim_create_autocmd({ 'BufDelete', 'BufWipeout' }, {
  group = lint_group,
  callback = function(event)
    close_timer(event.buf)
  end,
})

-- Module loads after VimEnter, so the first buffer's BufReadPost already fired.
if vim.bo.filetype ~= '' then
  run_linter { buf = vim.api.nvim_get_current_buf(), event = 'BufReadPost' }
end
