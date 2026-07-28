-- vim.pack build hooks after install/update.
-- See `:help vim.pack`, `:help vim.pack-events`
--
-- Invariant: require this module before any vim.pack.add() in the session.
-- PackChanged install hooks only fire for plugins installed on the first
-- vim.pack.add() call that bootstraps from the lockfile.

local function run_build(name, cmd, cwd)
  local result = vim.system(cmd, { cwd = cwd }):wait()
  if result.code ~= 0 then
    local stderr = result.stderr or ''
    local stdout = result.stdout or ''
    local output = stderr ~= '' and stderr or stdout
    if output == '' then output = 'No output from build command.' end
    vim.notify(('Build failed for %s:\n%s'):format(name, output), vim.log.levels.ERROR)
  end
end

vim.api.nvim_create_autocmd('PackChanged', {
  callback = function(ev)
    local name = ev.data.spec.name
    local kind = ev.data.kind
    if kind ~= 'install' and kind ~= 'update' then return end

    if name == 'LuaSnip' then
      if vim.fn.has 'win32' ~= 1 and vim.fn.executable 'make' == 1 then run_build(name, { 'make', 'install_jsregexp' }, ev.data.path) end
      return
    end

    if name == 'nvim-treesitter' then
      if not ev.data.active then vim.cmd.packadd 'nvim-treesitter' end
      vim.cmd 'TSUpdate'
      return
    end

    if name == 'markdown-preview.nvim' then
      local app = vim.fs.joinpath(ev.data.path, 'app')
      if vim.fn.executable 'yarn' == 1 then
        run_build(name, { 'yarn', 'install', '--frozen-lockfile' }, app)
      elseif vim.fn.executable 'npm' == 1 then
        run_build(name, { 'npm', 'install', '--legacy-peer-deps' }, app)
      end
      return
    end
  end,
})

-- Pack management (see `:help vim.pack`)
vim.keymap.set('n', '<leader>pu', function() vim.pack.update() end, { desc = '[P]ack [U]pdate (fetch + review)' })

vim.keymap.set('n', '<leader>pi', function() vim.pack.update(nil, { target = 'lockfile' }) end, { desc = '[P]ack [I]nstall/sync from lockfile' })

vim.keymap.set('n', '<leader>po', function() vim.pack.update(nil, { offline = true }) end, { desc = '[P]ack [O]ffline status' })

vim.keymap.set('n', '<leader>pc', function()
  local inactive = vim.iter(vim.pack.get()):filter(function(p) return not p.active end):map(function(p) return p.spec.name end):totable()
  if #inactive == 0 then
    vim.notify('No inactive plugins to clean', vim.log.levels.INFO)
    return
  end
  vim.pack.del(inactive)
  vim.notify(('Removed %d inactive plugin(s)'):format(#inactive), vim.log.levels.INFO)
end, { desc = '[P]ack [C]lean inactive' })

vim.keymap.set('n', '<leader>pm', function() vim.cmd 'Mason' end, { desc = '[P]ack [M]ason' })
