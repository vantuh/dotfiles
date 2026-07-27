-- LSP: fidget, mason, servers, buffer keymaps.

vim.pack.add {
  'https://github.com/j-hui/fidget.nvim',
  'https://github.com/neovim/nvim-lspconfig',
  'https://github.com/mason-org/mason.nvim',
  'https://github.com/mason-org/mason-lspconfig.nvim',
  'https://github.com/WhoIsSethDaniel/mason-tool-installer.nvim',
  'https://github.com/b0o/SchemaStore.nvim',
  'https://github.com/folke/lazydev.nvim',
}

require('fidget').setup {}
require('lazydev').setup {
  library = {
    { path = '${3rd}/luv/library', words = { 'vim%.uv' } },
    { path = 'snacks.nvim', words = { 'Snacks' } },
    { path = 'nvim-lspconfig', words = { 'lspconfig.settings' } },
  },
}

vim.keymap.set('n', '<leader>ca', vim.lsp.buf.code_action, { desc = 'Code Action' })
vim.keymap.set('n', '<leader>cr', vim.lsp.buf.rename, { desc = 'Rename' })
vim.keymap.set('n', '<leader>ss', function() Snacks.picker.lsp_symbols() end, { desc = 'LSP Symbols' })
vim.keymap.set('n', '<leader>sS', function() Snacks.picker.lsp_workspace_symbols() end, { desc = 'LSP Workspace Symbols' })

vim.api.nvim_create_autocmd('LspAttach', {
  group = vim.api.nvim_create_augroup('lsp-attach', { clear = true }),
  callback = function(event)
    local map = function(keys, func, desc, mode)
      mode = mode or 'n'
      vim.keymap.set(mode, keys, func, { buffer = event.buf, desc = 'LSP: ' .. desc })
    end

    map('grn', vim.lsp.buf.rename, '[R]e[n]ame')
    map('gra', vim.lsp.buf.code_action, '[G]oto Code [A]tion', { 'n', 'x' })
    map('grD', vim.lsp.buf.declaration, '[G]oto [D]eclaration')
    map('<leader>cl', function() vim.cmd 'LspInfo' end, '[L]SP Info')
    map('gK', vim.lsp.buf.signature_help, 'Signature Help')
    map('<leader>cA', function()
      vim.lsp.buf.code_action { context = { only = { 'source' }, diagnostics = {} } }
    end, 'Source Action')
    map('<leader>co', function()
      vim.lsp.buf.code_action { context = { only = { 'source.organizeImports' }, diagnostics = {} } }
    end, 'Organize Imports')
    map('gai', function() Snacks.picker.lsp_incoming_calls() end, 'Incoming Calls')
    map('gao', function() Snacks.picker.lsp_outgoing_calls() end, 'Outgoing Calls')

    -- LazyVim-style navigation via Snacks picker
    map('gd', function() Snacks.picker.lsp_definitions() end, 'Goto Definition')
    -- nowait: avoid waiting for grn/gra/grD prefix
    vim.keymap.set('n', 'gr', function() Snacks.picker.lsp_references() end, {
      buffer = event.buf,
      desc = 'LSP: References',
      nowait = true,
    })
    map('gI', function() Snacks.picker.lsp_implementations() end, 'Goto Implementation')
    map('gy', function() Snacks.picker.lsp_type_definitions() end, 'Goto Type Definition')

    local client = vim.lsp.get_client_by_id(event.data.client_id)
    if client and client:supports_method('textDocument/documentHighlight', event.buf) then
      local highlight_augroup = vim.api.nvim_create_augroup('lsp-highlight', { clear = false })
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
        group = vim.api.nvim_create_augroup('lsp-detach', { clear = true }),
        callback = function(event2)
          vim.lsp.buf.clear_references()
          vim.api.nvim_clear_autocmds { group = 'lsp-highlight', buffer = event2.buf }
        end,
      })
    end

    if client and client:supports_method('textDocument/inlayHint', event.buf) then
      map('<leader>th', function() vim.lsp.inlay_hint.enable(not vim.lsp.inlay_hint.is_enabled { bufnr = event.buf }) end, '[T]oggle Inlay [H]ints')
    end

    -- Rename file via Snacks when the server supports workspace rename operations.
    if client and (client:supports_method('workspace/didRenameFiles', event.buf) or client:supports_method('workspace/willRenameFiles', event.buf)) then
      map('<leader>cR', function() Snacks.rename.rename_file() end, 'Rename File')
    end
  end,
})

-- Angular LS mason path (used as a vtsls tsserver plugin, like LazyVim).
local angular_ls_path = vim.fs.joinpath(vim.fn.stdpath 'data', 'mason', 'packages', 'angular-language-server', 'node_modules', '@angular', 'language-server')

local capabilities = vim.lsp.protocol.make_client_capabilities()
local blink_ok, blink = pcall(require, 'completion.blink')
if blink_ok then capabilities = blink.get_lsp_capabilities(nil, true) end

-- Shared capability: workspace file-operation rename events (used by Snacks.rename).
capabilities = vim.tbl_deep_extend('force', capabilities, {
  workspace = {
    fileOperations = {
      didRename = true,
      willRename = true,
    },
  },
})

---@type table<string, vim.lsp.Config>
local servers = {
  -- Prefer vtsls for navigation; keep angularls for templates only.
  vtsls = {
    settings = {
      complete_function_calls = true,
      vtsls = {
        enableMoveToFileCodeAction = true,
        autoUseWorkspaceTsdk = true,
        experimental = {
          maxInlayHintLength = 30,
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
          enumMemberValues = { enabled = true },
          functionLikeReturnTypes = { enabled = true },
          parameterNames = { enabled = 'literals' },
          parameterTypes = { enabled = true },
          propertyDeclarationTypes = { enabled = true },
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
  dockerls = {},
  docker_compose_language_service = {},
  eslint = {
    settings = {
      workingDirectories = { mode = 'auto' },
      format = true,
    },
  },
  tailwindcss = {
    filetypes_exclude = { 'markdown' },
  },
  marksman = {},
  prismals = {},
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
      new_config.settings.yaml.schemas = vim.tbl_deep_extend('force', new_config.settings.yaml.schemas or {}, require('schemastore').yaml.schemas())
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
        if path ~= vim.fn.stdpath 'config' and (vim.uv.fs_stat(path .. '/.luarc.json') or vim.uv.fs_stat(path .. '/.luarc.jsonc')) then return end
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
        hint = {
          enable = true,
          setType = false,
          paramType = true,
          paramName = 'Disable',
          semicolon = 'Disable',
          arrayIndex = 'Disable',
        },
      },
    },
  },
}

require('mason').setup {}

local ensure_installed = vim.tbl_keys(servers)
vim.list_extend(ensure_installed, {
  'hadolint',
  'markdown-toc',
  'markdownlint-cli2',
  'prettier',
  'shfmt',
  'sqlfluff',
  'stylua',
})
require('mason-tool-installer').setup {
  ensure_installed = ensure_installed,
  -- Tools are already installed; skip registry scan / ensure on every VimEnter.
  run_on_start = false,
}

-- angularls also attaches to TypeScript; without this, Snacks gd/gr waits on BOTH.
vim.api.nvim_create_autocmd('LspAttach', {
  group = vim.api.nvim_create_augroup('lsp-angularls-nav', { clear = true }),
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

-- vtsls buffer-local keymaps and _typescript.moveToFileRefactoring handler.
vim.api.nvim_create_autocmd('LspAttach', {
  group = vim.api.nvim_create_augroup('lsp-vtsls', { clear = true }),
  callback = function(event)
    local client = vim.lsp.get_client_by_id(event.data.client_id)
    if not client or client.name ~= 'vtsls' then return end

    local buf = event.buf
    local map = function(keys, func, desc) vim.keymap.set('n', keys, func, { buffer = buf, desc = 'LSP: ' .. desc }) end

    -- gD: go to TypeScript source definition (not .d.ts)
    map('gD', function()
      local win = vim.api.nvim_get_current_win()
      local params = vim.lsp.util.make_position_params(win, 'utf-16')
      require('trouble').open {
        mode = 'lsp_command',
        params = {
          command = 'typescript.goToSourceDefinition',
          arguments = { params.textDocument.uri, params.position },
        },
      }
    end, 'Goto Source Definition')

    -- gR: find all file references
    map(
      'gR',
      function()
        require('trouble').open {
          mode = 'lsp_command',
          params = {
            command = 'typescript.findAllFileReferences',
            arguments = { vim.uri_from_bufnr(0) },
          },
        }
      end,
      'File References'
    )

    -- <leader>cM: add missing imports
    map(
      '<leader>cM',
      function()
        vim.lsp.buf.code_action {
          apply = true,
          context = { only = { 'source.addMissingImports.ts' }, diagnostics = {} },
        }
      end,
      'Add Missing Imports'
    )

    -- <leader>cD: fix all diagnostics
    map(
      '<leader>cD',
      function()
        vim.lsp.buf.code_action {
          apply = true,
          context = { only = { 'source.fixAll.ts' }, diagnostics = {} },
        }
      end,
      'Fix All Diagnostics'
    )

    -- <leader>cV: select TypeScript workspace version
    map(
      '<leader>cV',
      function() client:exec_cmd({ command = 'typescript.selectTypeScriptVersion', arguments = nil }, { bufnr = buf }) end,
      'Select TS Workspace Version'
    )

    -- _typescript.moveToFileRefactoring: interactive file picker (adapted from upstream).
    client.commands['_typescript.moveToFileRefactoring'] = function(command, _ctx)
      local action, uri, range = unpack(command.arguments)

      local function move(newf)
        client:request('workspace/executeCommand', {
          command = command.command,
          arguments = { action, uri, range, newf },
        })
      end

      local fname = vim.uri_to_fname(uri)
      client:request('workspace/executeCommand', {
        command = 'typescript.tsserverRequest',
        arguments = {
          'getMoveToRefactoringFileSuggestions',
          {
            file = fname,
            startLine = range.start.line + 1,
            startOffset = range.start.character + 1,
            endLine = range['end'].line + 1,
            endOffset = range['end'].character + 1,
          },
        },
      }, function(_, result)
        local files = result.body.files
        table.insert(files, 1, 'Enter new path...')
        vim.ui.select(files, {
          prompt = 'Select move destination:',
          format_item = function(f) return vim.fn.fnamemodify(f, ':~:.') end,
        }, function(f)
          if f and f:find '^Enter new path' then
            vim.ui.input({
              prompt = 'Enter move destination:',
              default = vim.fn.fnamemodify(fname, ':h') .. '/',
              completion = 'file',
            }, function(newf) return newf and move(newf) end)
          elseif f then
            move(f)
          end
        end)
      end)
    end
  end,
})

for name, server in pairs(servers) do
  server.capabilities = vim.tbl_deep_extend('force', {}, capabilities, server.capabilities or {})
  vim.lsp.config(name, server)
  vim.lsp.enable(name)
end
