-- LSP: fidget, mason, servers, buffer keymaps.

vim.pack.add({
  'https://github.com/j-hui/fidget.nvim',
  'https://github.com/neovim/nvim-lspconfig',
  'https://github.com/mason-org/mason.nvim',
  'https://github.com/mason-org/mason-lspconfig.nvim',
  'https://github.com/WhoIsSethDaniel/mason-tool-installer.nvim',
  'https://github.com/b0o/SchemaStore.nvim',
  'https://github.com/folke/lazydev.nvim',
})

require('fidget').setup({})
require('lazydev').setup({
  library = {
    { path = '${3rd}/luv/library', words = { 'vim%.uv' } },
    { path = 'snacks.nvim', words = { 'Snacks' } },
    { path = 'nvim-lspconfig', words = { 'lspconfig.settings' } },
  },
})

vim.api.nvim_create_autocmd('LspAttach', {
  group = vim.api.nvim_create_augroup('kickstart-lsp-attach', { clear = true }),
  callback = function(event)
    local map = function(keys, func, desc, mode)
      mode = mode or 'n'
      vim.keymap.set(mode, keys, func, { buffer = event.buf, desc = 'LSP: ' .. desc })
    end

    map('grn', vim.lsp.buf.rename, '[R]e[n]ame')
    map('gra', vim.lsp.buf.code_action, '[G]oto Code [A]ction', { 'n', 'x' })
    map('grD', vim.lsp.buf.declaration, '[G]oto [D]eclaration')

    local client = vim.lsp.get_client_by_id(event.data.client_id)
    if client and client:supports_method('textDocument/documentHighlight', event.buf) then
      local highlight_augroup = vim.api.nvim_create_augroup('kickstart-lsp-highlight', { clear = false })
      vim.api.nvim_create_autocmd({ 'CursorHold', 'CursorHoldI' }, {
        buffer = event.buf,
        group = highlight_augroup,
        callback = vim.lsp.buf.document_highlight,
      })

      vim.api.nvim_create_autocmd({ 'CursorMoved', 'CursorMovedI' }, {
        buffer = event.buf,
        group = highlight_augroup,
        callback = vim.lsp.buf.clear_references,
      })

      vim.api.nvim_create_autocmd('LspDetach', {
        group = vim.api.nvim_create_augroup('kickstart-lsp-detach', { clear = true }),
        callback = function(event2)
          vim.lsp.buf.clear_references()
          vim.api.nvim_clear_autocmds({ group = 'kickstart-lsp-highlight', buffer = event2.buf })
        end,
      })
    end

    if client and client:supports_method('textDocument/inlayHint', event.buf) then
      map('<leader>th', function()
        vim.lsp.inlay_hint.enable(not vim.lsp.inlay_hint.is_enabled({ bufnr = event.buf }))
      end, '[T]oggle Inlay [H]ints')
    end
  end,
})

-- Angular LS mason path (used as a vtsls tsserver plugin, like LazyVim).
local angular_ls_path = vim.fs.joinpath(
  vim.fn.stdpath('data'),
  'mason',
  'packages',
  'angular-language-server',
  'node_modules',
  '@angular',
  'language-server'
)

---@type table<string, vim.lsp.Config>
local servers = {
  -- Prefer vtsls for navigation; keep angularls for templates only.
  vtsls = {
    settings = {
      complete_function_calls = true,
      vtsls = {
        autoUseWorkspaceTsdk = true,
        experimental = {
          completion = { enableServerSideFuzzyMatch = true },
        },
        tsserver = {
          globalPlugins = vim.uv.fs_stat(angular_ls_path) and {
            {
              name = '@angular/language-server',
              location = angular_ls_path,
              enableForWorkspaceTypeScriptVersions = false,
            },
          } or nil,
        },
      },
      typescript = {
        updateImportsOnFileMove = { enabled = 'always' },
        suggest = { completeFunctionCalls = true },
        inlayHints = {
          parameterNames = { enabled = 'literals' },
          parameterTypes = { enabled = true },
          variableTypes = { enabled = false },
        },
      },
    },
    on_init = function(client)
      local settings = client.config.settings or {}
      if settings.typescript then
        settings.javascript = vim.tbl_deep_extend('force', {}, settings.typescript, settings.javascript or {})
        client.config.settings = settings
      end
    end,
  },
  angularls = {},
  eslint = {},
  tailwindcss = {},
  jsonls = {
    before_init = function(_, new_config)
      new_config.settings.json.schemas = new_config.settings.json.schemas or {}
      vim.list_extend(new_config.settings.json.schemas, require('schemastore').json.schemas())
    end,
    settings = {
      json = {
        format = { enable = true },
        validate = { enable = true },
      },
    },
  },
  yamlls = {
    before_init = function(_, new_config)
      new_config.settings.yaml.schemas = vim.tbl_deep_extend(
        'force',
        new_config.settings.yaml.schemas or {},
        require('schemastore').yaml.schemas()
      )
    end,
    settings = {
      redhat = { telemetry = { enabled = false } },
      yaml = {
        keyOrdering = false,
        format = { enable = true },
        validate = true,
        schemaStore = {
          enable = false,
          url = '',
        },
      },
    },
  },
  lua_ls = {
    on_init = function(client)
      client.server_capabilities.documentFormattingProvider = false

      if client.workspace_folders then
        local path = client.workspace_folders[1].name
        if path ~= vim.fn.stdpath('config') and (vim.uv.fs_stat(path .. '/.luarc.json') or vim.uv.fs_stat(path .. '/.luarc.jsonc')) then
          return
        end
      end

      client.config.settings.Lua = vim.tbl_deep_extend('force', client.config.settings.Lua, {
        runtime = {
          version = 'LuaJIT',
          path = { 'lua/?.lua', 'lua/?/init.lua' },
        },
        workspace = {
          checkThirdParty = false,
          library = vim.tbl_extend('force', vim.api.nvim_get_runtime_file('', true), {
            '${3rd}/luv/library',
            '${3rd}/busted/library',
          }),
        },
      })
    end,
    settings = {
      Lua = {
        format = { enable = false },
      },
    },
  },
}

require('mason').setup({})

local ensure_installed = vim.tbl_keys(servers)
vim.list_extend(ensure_installed, {
  'golangci-lint',
  'hadolint',
  'markdown-toc',
  'markdownlint-cli2',
  'prettier',
  'sqlfluff',
  'stylua',
  'tflint',
})
require('mason-tool-installer').setup({ ensure_installed = ensure_installed })

-- angularls also attaches to TypeScript; without this, Snacks gd/gr waits on BOTH.
vim.api.nvim_create_autocmd('LspAttach', {
  group = vim.api.nvim_create_augroup('kickstart-angularls-nav', { clear = true }),
  callback = function(event)
    local client = vim.lsp.get_client_by_id(event.data.client_id)
    if not client or client.name ~= 'angularls' then return end
    client.server_capabilities.renameProvider = false
    client.server_capabilities.definitionProvider = false
    client.server_capabilities.referencesProvider = false
    client.server_capabilities.implementationProvider = false
    client.server_capabilities.typeDefinitionProvider = false
  end,
})

for name, server in pairs(servers) do
  vim.lsp.config(name, server)
  vim.lsp.enable(name)
end
