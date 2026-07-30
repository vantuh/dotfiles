# CHANGELOG — nvim (personal config)

History of deliberate deviations of this config from the baseline LazyVim
setup (`.config/lazyvim/`, commit `c10948c50b18fae7f256433afdef09e432410480`)
and of iterative changes in this config.

**Purpose:** a single source of truth for how personal intentionally differs
from LazyVim. The parity audit must cross-check against this file and must
**not** count anything listed here as a "gap" or an unexpected difference.

Context: [AGENTS.md](AGENTS.md) · audit prompt: [PARITY-AUDIT-PROMPT.md](PARITY-AUDIT-PROMPT.md)

---

## Deliberately excluded (decisions, not bugs)

- **Folding — completely disabled.** `foldenable = false`, `foldcolumn = '0'`,
  `sessionoptions` without `folds`. Folding is not used on principle.
  LazyVim configures folding (`foldlevel = 99`, `foldmethod = 'indent'`,
  `foldtext = ''`) — this was intentionally NOT ported.
- **Debugger / DAP — absent.** No debug adapters, DAP keymaps, or
  dependencies. Not used on principle.
- **lazy.nvim — absent.** Package manager is `vim.pack` (built-in).
- **Telescope — removed.** The Snacks picker (`ui_select = true`) fully replaces it.
- **cmp-git — not added.** Completion engine is Blink; the upstream extra
  wires cmp-git only for nvim-cmp.
- **Language extras Go / Python / Terraform — not ported automatically.**
  Each language is a separate decision.

## Personal-only features

- **Custom hunk review** — `<leader>gH` runs `hunk diff --watch` in a float
  terminal (`Snacks.terminal.toggle`). Not present in LazyVim.
- `fidget.nvim` — LSP progress in the statusline.
- `guess-indent.nvim` — automatic indentation detection.
- `mini.surround` — surround textobjects.
- Persistence safety hook — the session is not restored if nvim was started with arguments.
- SSH clipboard defer — clipboard is initialized after startup.

---

## Iterative changes

### 2026-07-30

- **herdr-nvim-edit:** opens files in a running Herdr nvim in the **current**
  workspace only (same git root preferred) via `Ctrl-\ Ctrl-n` + `:edit`. If
  none: reuse a tab labeled `nvim` in that workspace, else create one and
  `pane run nvim`. Standalone Herdr lazygit uses it via `lazygit/config.yml`.
  Snacks `<leader>gg` keeps default `nvim-remote`.

### 2026-07-29

- **Became the default `nvim` config.** The two Neovim setups were merged into
  a single stow package `nvim/`: this personal config now lives at
  `.config/nvim/` (default `nvim`, `~/.config/nvim`), and the old LazyVim setup
  moved to `.config/lazyvim/` (appname `lazyvim`, run via `nvim-lazy`). The
  separate `nvim-personal` package and the `NVIM_APPNAME=nvim-personal` alias
  were removed.
- **Docs:** refresh paths after the package merge — `COMMANDS.md` notes
  personal vs LazyVim layouts; drop missing `LICENSE.kickstart.md` /
  `PARITY-AUDIT*.md` links from README / AGENTS / audit prompt.
- **Quit:** on `QuitPre`, clear `modified` on empty/Snacks buffers so `:qa`
  with the explorer open does not ask to save Untitled. Do not close windows
  there — that aborted `:qa` after only the sidebar closed (`␣qq`). Window
  cleanup stays on `PersistenceSavePre`.
- **Removed dadbod UI:** dropped `vim-dadbod-ui` and `<leader>D`. Kept
  `vim-dadbod` + `vim-dadbod-completion` for SQL Blink completion only (no
  connection sidebar). Loads on `sql`/`mysql`/`plsql` FileType.
- **postgres_lsp:** enable Supabase Postgres Language Server for `.sql`
  (`postgres-language-server` via Mason). Root markers include `.git` so it
  attaches without a project `postgres-language-server.jsonc`.
- **Removed `<leader>K` (keywordprg).** Escape hatch for original `K`/`man`
  after TS hover remapped `K`; unused.
- **Zoom toggle:** only `<leader>uZ` (UI). Dropped duplicate `<leader>wm`
  (LazyVim had both).
- **Todo keymaps (LazyVim parity):** `<leader>st`/`<leader>sT` = Snacks Todo
  picker; `<leader>xt`/`<leader>xT` = Trouble. Removed mistaken
  `<leader>st` → Trouble override from `trouble.lua`.
- **Buffers:** keep both cycle aliases — `<S-h>`/`<S-l>` and `[b`/`]b`.
- **Tab pages unused:** removed `<leader><Tab>*` keymaps and which-key
  `[T]abs` group. No tab-page plugin was installed (bufferline is buffers).
  Kept `tabdo` resize autocmd, `sessionoptions` `tabpages`, and UI toggle
  for `showtabline` (controls bufferline visibility).
- **UI toggles unified under `<leader>u`:** dropped which-key `[T]oggle`
  group. Git blame/word-diff: `<leader>tb`/`tw` → `uB`/`uW`. Removed
  duplicate `<leader>th` inlay hints (Snacks `<leader>uh` remains).
- **which-key icons:** group labels are plain words (`buffer`, `search`, …)
  like LazyVim so built-in icon rules match. Bracketed `[B]uffer`-style
  names hid icons. Extra `icons.rules` cover leftovers that LazyVim gets
  via lazy.nvim→plugin icons (grep, marks, pack, hunk, …). Keymap `desc`
  strings aligned to LazyVim wording (snacks picker, gitsigns, pack,
  conform, trouble).
- **Removed Snacks profiler:** dropped `<leader>dpp`/`dph` and which-key
  `profiler` groups. Not used day-to-day; wrapping LSP funcs conflicts
  with noice and stop can crash (`E484` on Neovim runtime path).

- **Theme:** `dracula` → `catppuccin` (mocha). The LazyVim setup stays on dracula.
- **Scratch buffers enabled:** `<leader>.` (toggle), `<leader>S` (select).
  Previously absent in personal (in LazyVim — `util.lua`).
- **Scratch picker keymaps:** in the scratch buffer list `<C-a>` — create,
  `<C-d>` — delete (in both n and i modes); the default `<C-n>`/`<C-x>` are kept too.
- **Snacks perf modules enabled:** `bigfile` and `quickfile` (previously not enabled).
- **Window hydra:** `<C-w><space>` → which-key loop over `<c-w>` mappings
  (equivalent to LazyVim `editor.lua`).
- **Removed explicit terminal keymaps:** `<leader>ft`, `<leader>fT`, `<C-/>`,
  `<C-_>`. The terminal as a standalone feature is not used. The Snacks
  `terminal` module is **kept** — it is needed as a dependency for lazygit
  (`<leader>gg`/`<leader>gG`) and hunk review (`<leader>gH`); `<Esc><Esc>`
  for exiting terminal mode is kept too.
