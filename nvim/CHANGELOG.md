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
