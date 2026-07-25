-- LazyVim-style muscle-memory aliases on top of kickstart/snacks.
-- Keeps kickstart maps where they don't clash; overrides a few (cf, ss/sS, gd/gr).

vim.pack.add({ "https://github.com/folke/flash.nvim" })
require("flash").setup({})

vim.keymap.set({ "n", "x", "o" }, "s", function()
  require("flash").jump()
end, { desc = "Flash" })

vim.keymap.set({ "n", "x", "o" }, "S", function()
  require("flash").treesitter()
end, { desc = "Flash Treesitter" })

local function git_root()
  return Snacks.git.get_root()
end

-- Find / navigate
vim.keymap.set("n", "<leader>ff", function()
  Snacks.picker.files({ cwd = git_root() })
end, { desc = "Find Files (Root Dir)" })

vim.keymap.set("n", "<leader>fF", function()
  Snacks.picker.files()
end, { desc = "Find Files (cwd)" })

vim.keymap.set("n", "<leader>fg", function()
  Snacks.picker.git_files()
end, { desc = "Find Files (git-files)" })

vim.keymap.set("n", "<leader>fr", function()
  Snacks.picker.recent()
end, { desc = "Recent Files" })

vim.keymap.set("n", "<leader>fp", function()
  Snacks.picker.projects()
end, { desc = "Projects" })

vim.keymap.set("n", "<leader>fc", function()
  Snacks.picker.files({ cwd = vim.fn.stdpath("config") })
end, { desc = "Find Config File" })

vim.keymap.set("n", "<leader>E", function()
  Snacks.explorer({ cwd = vim.uv.cwd() })
end, { desc = "File Explorer (cwd)" })

vim.keymap.set("n", "<leader>ft", function()
  Snacks.terminal()
end, { desc = "Terminal" })

vim.keymap.set({ "n", "t" }, "<C-/>", function()
  Snacks.terminal()
end, { desc = "Terminal" })

-- Some terminals send C-/ as C-_
vim.keymap.set({ "n", "t" }, "<C-_>", function()
  Snacks.terminal()
end, { desc = "Terminal" })


-- Git pickers
vim.keymap.set("n", "<leader>gs", function()
  Snacks.picker.git_status()
end, { desc = "Git Status" })

vim.keymap.set("n", "<leader>gd", function()
  Snacks.picker.git_diff()
end, { desc = "Git Diff (hunks)" })

vim.keymap.set("n", "<leader>gl", function()
  Snacks.picker.git_log({ cwd = git_root() })
end, { desc = "Git Log" })

vim.keymap.set("n", "<leader>gb", function()
  Snacks.picker.git_log_line()
end, { desc = "Git Blame Line" })

vim.keymap.set("n", "<leader>gf", function()
  Snacks.picker.git_log_file()
end, { desc = "Git File History" })

-- LSP / code (LazyVim names; kickstart defaults still available as gr*)
vim.keymap.set("n", "<leader>ca", vim.lsp.buf.code_action, { desc = "Code Action" })
vim.keymap.set("n", "<leader>cr", vim.lsp.buf.rename, { desc = "Rename" })
vim.keymap.set({ "n", "v" }, "<leader>cf", function()
  require("conform").format({ async = true })
end, { desc = "Format Buffer" })
vim.keymap.set("n", "<leader>cd", vim.diagnostic.open_float, { desc = "Line Diagnostics" })

vim.keymap.set("n", "<leader>ss", function()
  Snacks.picker.lsp_symbols()
end, { desc = "LSP Symbols" })

vim.keymap.set("n", "<leader>sS", function()
  Snacks.picker.lsp_workspace_symbols()
end, { desc = "LSP Workspace Symbols" })

local function diagnostic_goto(next, severity)
  return function()
    vim.diagnostic.jump({
      count = next and 1 or -1,
      severity = severity and vim.diagnostic.severity[severity] or nil,
      float = true,
    })
  end
end

vim.keymap.set("n", "]d", diagnostic_goto(true), { desc = "Next Diagnostic" })
vim.keymap.set("n", "[d", diagnostic_goto(false), { desc = "Prev Diagnostic" })
vim.keymap.set("n", "]e", diagnostic_goto(true, "ERROR"), { desc = "Next Error" })
vim.keymap.set("n", "[e", diagnostic_goto(false, "ERROR"), { desc = "Prev Error" })

vim.api.nvim_create_autocmd("LspAttach", {
  group = vim.api.nvim_create_augroup("lazyvim-habits-lsp", { clear = true }),
  callback = function(event)
    local opts = { buffer = event.buf }
    vim.keymap.set("n", "gd", function()
      Snacks.picker.lsp_definitions()
    end, vim.tbl_extend("force", opts, { desc = "Goto Definition" }))
    vim.keymap.set("n", "gr", function()
      Snacks.picker.lsp_references()
    end, vim.tbl_extend("force", opts, { desc = "References", nowait = true }))
    vim.keymap.set("n", "gI", function()
      Snacks.picker.lsp_implementations()
    end, vim.tbl_extend("force", opts, { desc = "Goto Implementation" }))
    vim.keymap.set("n", "gy", function()
      Snacks.picker.lsp_type_definitions()
    end, vim.tbl_extend("force", opts, { desc = "Goto Type Definition" }))
  end,
})
