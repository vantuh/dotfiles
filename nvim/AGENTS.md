# AGENTS.md — nvim (personal config)

Context and rules for AI agents working with this config.

## What it is and where it came from

This config (the default `nvim`, at `.config/nvim/`) started as a fork of
[Kickstart.nvim](https://github.com/nvim-lua/kickstart.nvim)
(commit `f0a2108ed51547793c758d9318bad94f242b22e5`).
Kickstart is a starting point, **not a runtime dependency**. Almost nothing
of the original Kickstart remains: structure, plugins, keymaps, LSP — all
fully rewritten.

A parallel LazyVim setup lives beside it in the same package at
`.config/lazyvim/` (appname `lazyvim`, commit
`c10948c50b18fae7f256433afdef09e432410480`). Goal: this personal config should
reproduce the useful functionality of LazyVim, but without depending on it
as a framework. Everything explicit, everything under control.

## Current parity status

**Parity: ~98–99% of daily functionality** (as of 2026-07-28).

Three audit rounds were performed (V1 ~88–92%, V2 ~94–96%, V3 current ~98–99%).
Earlier written audit reports are not kept in the repo.

For a new audit round see [PARITY-AUDIT-PROMPT.md](PARITY-AUDIT-PROMPT.md)
(prompt to run in a fresh agent session).

## What was intentionally NOT ported

These are not gaps — they are deliberate decisions. The full list of
deviations and iterative changes is kept in [CHANGELOG.md](CHANGELOG.md).

### Folding — completely absent

`foldenable = false`, `foldcolumn = '0'`. LazyVim configures folding
(`foldlevel = 99`, `foldmethod = 'indent'`, `foldtext = ''`). Personal
does not use folding and does not want it.

### Explorer floating preview — replaced

The LazyVim config (`.config/lazyvim/`) has a custom floating preview in the sidebar
explorer (~160 lines, a separate float window over main on hover). Personal
uses `preview = 'main'` — preview in the main split. A deliberate
simplification.

### Telescope — removed

`telescope.nvim`, `telescope-fzf-native.nvim`, `telescope-ui-select.nvim`
removed from the lockfile. The Snacks picker (`ui_select = true`) fully
replaces them. If the packages still physically exist on disk — remove them
via `<leader>pc` (Pack Clean inactive).

### DAP / debugger — absent

No debugger adapters, DAP keymaps, or dependencies. Not used.

### lazy.nvim — absent

Package manager: `vim.pack` (Neovim built-in). No LazyVim framework or
lazy.nvim.

### Language extras — not all ported

Go, Python, Terraform exist in the LazyVim setup (`.config/lazyvim/`), but are not
added automatically in personal. Each language is a separate decision.

`cmp-git` not added: the completion engine is Blink, and LazyVim wires
cmp-git only for nvim-cmp.

### sessionoptions without `folds`

LazyVim stores fold state in sessions. Personal does not — folding is
disabled.

## Personal-only features

- `fidget.nvim` — LSP progress in the statusline
- `guess-indent.nvim` — automatic indentation detection
- `mini.surround` — surround textobjects (not present in LazyVim)
- Persistence safety hook — the session is not restored if arguments were passed
- SSH clipboard defer — clipboard is initialized after startup

## Config structure

```
init.lua              bootstrap: require all modules
lua/
  core/
    options.lua       vim options
    keymaps.lua       core keymaps (non-plugin)
    autocmds.lua      autocmds
  ui/
    colorscheme.lua   theme (catppuccin)
    lualine.lua       statusline
    bufferline.lua    tabline
    noice.lua         cmdline/messages UI
    which_key.lua     which-key
    ui_extras.lua     virt-column, mini.icons
  editor/
    snacks.lua        Snacks: picker, explorer, terminal, git, toggles
    gitsigns.lua      Gitsigns + keymaps
    flash.lua         Flash motions
    mini.lua          mini.ai textobjects + mini.surround
    todo_comments.lua TODO/FIXME highlights + pickers
    grug_far.lua      Search & replace
    autosave.lua      auto-save
    guess_indent.lua  indent detection
    persistence.lua   sessions
    dadbod.lua        DB UI
  lang/
    treesitter.lua         parsers, textobjects, autotag
    ts_expand_hover.lua    TypeScript expandable hover
    markdown_preview.lua
    render_markdown.lua
  lsp/
    lsp.lua           LSP servers, keymaps, Mason
    conform.lua       formatting
    lint.lua          linting
    trouble.lua       diagnostics UI
  completion/
    blink.lua         blink.cmp
    completion.lua    cmdline completion
  defer.lua           deferred setup (SSH clipboard)
  pack.lua            vim.pack keymaps + build hooks
ftplugin/
  lua.lua             Lua filetype overrides
nvim-pack-lock.json   lockfile (tracked in git)
```

## Rules for agents

- **Edit only files inside the repository** (`~/dotfiles/nvim/.config/nvim/`),
  never directly in `~/.config/nvim/` — they are symlinked and
  changes will disappear on `stow --restow`.
- **Record any config change** (adding/removing a plugin, keymap, option, or
  behavior change) in [CHANGELOG.md](CHANGELOG.md) — iterative changes go in
  the dated section, deliberate exclusions in the relevant section.
- Do not add folding, DAP, or lazy.nvim.
- Do not add language extras (Go, Python, Terraform) without an explicit decision.
- Do not add cmp-git (completion engine is Blink).
- Verify Lua syntax and headless startup after changes:
  ```bash
  nvim --headless '+qa'                        # personal (default)
  NVIM_APPNAME=lazyvim nvim --headless '+qa'   # LazyVim
  ```
- After non-trivial changes run `git diff --check`.
- The lockfile (`nvim-pack-lock.json`) is tracked. Change it only when
  deliberately adding/removing a plugin.
