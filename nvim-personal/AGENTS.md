# AGENTS.md — nvim-personal

Контекст і правила для AI агентів, що працюють із цим конфігом.

## Що це і звідки

`nvim-personal` починався як fork
[Kickstart.nvim](https://github.com/nvim-lua/kickstart.nvim)
(commit `f0a2108ed51547793c758d9318bad94f242b22e5`).
Kickstart — стартова точка, **не runtime-залежність**. Від початкового
Kickstart зараз практично нічого не залишилось: структура, плагіни,
keymaps, LSP — все повністю переписано.

Паралельно існує `nvim/` — LazyVim-збірка (commit
`c10948c50b18fae7f256433afdef09e432410480`). Мета: `nvim-personal` має
відтворювати корисний функціонал LazyVim, але без залежності від нього як
фреймворку. Все явно, все під контролем.

## Поточний стан parity

**Parity: ~98–99% щоденного функціоналу** (станом на 2026-07-28).

Проведено три раунди аудиту:

- [PARITY-AUDIT.md](PARITY-AUDIT.md) — V1, вихідний аналіз (parity ~88–92%)
- [PARITY-AUDIT-V2.md](PARITY-AUDIT-V2.md) — V2, після Must/Should змін (parity ~94–96%)
- Поточний стан — V3, після Optional змін (parity ~98–99%)

Для нового раунду аудиту — див. [PARITY-AUDIT-PROMPT.md](PARITY-AUDIT-PROMPT.md)
(промпт для запуску в новій сесії агента).

## Що навмисно НЕ перенесено

Це не gaps — це свідомі рішення.

### Folding — повністю відсутній

`foldenable = false`, `foldcolumn = '0'`. LazyVim налаштовує folding
(`foldlevel = 99`, `foldmethod = 'indent'`, `foldtext = ''`). Personal
folding не використовує і не хоче.

### Explorer floating preview — замінено

LazyVim-конфіг (`nvim/`) має кастомний floating preview у sidebar explorer
(~160 рядків, окреме float-вікно над main при hover). Personal використовує
`preview = 'main'` — preview у головному split. Свідоме спрощення.

### Telescope — видалено

`telescope.nvim`, `telescope-fzf-native.nvim`, `telescope-ui-select.nvim`
прибрано з lockfile. Snacks picker (`ui_select = true`) повністю замінює
їх. Якщо пакети ще фізично є на диску — видалити через `<leader>pc`
(Pack Clean inactive).

### DAP / debugger — відсутній

Без debugger adapters, DAP keymaps і залежностей. Не використовується.

### lazy.nvim — відсутній

Package manager: `vim.pack` (Neovim built-in). Ніякого LazyVim framework
або lazy.nvim.

### Language extras — не всі перенесено

Go, Python, Terraform є в LazyVim-збірці (`nvim/`), але в personal не
додаються автоматично. Кожна мова — окреме рішення.

`cmp-git` не додано: completion engine — Blink, а LazyVim підключає cmp-git
лише для nvim-cmp.

### sessionoptions без `folds`

LazyVim зберігає стан фолдингу в сесіях. Personal не зберігає — folding
вимкнено.

## Що є тільки в personal (personal-only)

- `fidget.nvim` — LSP progress у statusline
- `guess-indent.nvim` — авто-детект відступів
- `mini.surround` — surround textobjects (у LazyVim немає)
- Persistence safety hook — сесія не відновлюється якщо передано аргументи
- SSH clipboard defer — clipboard ініціалізується після старту

## Структура конфігу

```
init.lua              bootstrap: require всі модулі
lua/
  core/
    options.lua       vim options
    keymaps.lua       core keymaps (не-plugin)
    autocmds.lua      autocmds
  ui/
    colorscheme.lua   тема (catppuccin)
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

## Правила для агентів

- **Редагуй тільки файли всередині репозиторію** (`~/dotfiles/nvim-personal/`),
  ніколи напряму в `~/.config/nvim-personal/` — вони symlinked і зміни
  зникнуть при `stow --restow`.
- Не додавай folding, DAP, lazy.nvim.
- Не додавай мовні extras (Go, Python, Terraform) без явного рішення.
- Не додавай cmp-git (completion engine — Blink).
- Перевіряй Lua syntax і headless startup після змін:
  ```bash
  NVIM_APPNAME=nvim-personal nvim --headless '+qa'
  ```
- Після нетривіальних змін запусти `git diff --check`.
- Lockfile (`nvim-pack-lock.json`) tracked. Змінюй тільки якщо свідомо
  додаєш/видаляєш плагін.
