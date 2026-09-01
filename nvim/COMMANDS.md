# Neovim — cheat sheet

By default `nvim` = personal config (`~/.config/nvim`).  
LazyVim: `nvim-lazy` (`NVIM_APPNAME=lazyvim`, `~/.config/lazyvim`).

`<leader>` = **Space** (`␣`).  
Examples: `␣␣` = Space Space, `␣gs` = Space g s.

In-editor hint: press `␣` and wait — **which-key** will appear.

---

## My patterns (quick copy-paste)

| Key | Action |
|--------|-----|
| `u` | **undo** — undo |
| `Ctrl-r` | redo — redo last undo |
| `G` | **jump to end** — end of file |
| `gg` | jump to start — start of file |
| `gd` | **jump to definition** — definition (LSP) |
| `gr` | **show all usages** — all usages in code (LSP references) |
| `gI` | go to implementation |
| `ciw` | **change the whole word** under the cursor (change inner word) |
| `cc` / `S` | **change line** — the entire line |
| `C` | change from cursor to end of line |
| `dd` | delete line |
| `yy` | yank line |
| `p` | paste |

---

## 1. Quick daily set

Learn these first:

1. `i` / `Esc` — write / leave  
2. `hjkl`, `w` `b`, `gg` `G` — motion  
3. `dd` `yy` `p` `u` `.` — basic editing  
4. `ciw` `diw` `yi"` `ci"` — words and quotes  
5. `/` + `n` — search  
6. `␣␣` — jump to file  
7. `␣e` — explorer  
8. `␣/` — grep  
9. `␣gs` / `␣gg` — git  
10. `␣fp` — projects  
11. `gd` `gr` `K` — LSP  
12. `␣sk` — if you forgot a hotkey  
13. `Shift-h` / `Shift-l` — between "tabs" (buffers)  

---

## 2. File navigation without a mouse

### How to pick a command

1. **The target is visible on screen** → `s` (Flash), type the start of the text and press the label.
2. **The needed character is on this line** → `f{char}` or `t{char}`.
3. **The cursor is already on the needed word** → `*`, then `n` / `N`.
4. **You know the needed text** → `/text`, then `n` / `N`.
5. **You know the line number** → `50G` or `:50`.
6. **You need to scroll the file** → `Ctrl-d` / `Ctrl-u`.
7. **You need to go back after a jump** → `Ctrl-o` / `Ctrl-i`.

| Key | Action |
|--------|-----|
| `Ctrl-d` / `Ctrl-u` | half screen down / up |
| `gg` / `G` | start / end of file |
| `50G` / `:50` | go to line 50 |
| `w` / `b` / `e` | next word / previous / end of word |
| `0` / `^` / `$` | start / first text / end of line |
| `f{c}` / `F{c}` | to character `c` forward / backward |
| `t{c}` / `T{c}` | before character `c` forward / backward |
| `;` / `,` | repeat last `f`/`t` / repeat backward |
| `*` / `#` | next / previous occurrence of the word under the cursor |
| `/text` | search text in the file |
| `n` / `N` | next / previous search result |
| `s` | Flash: jump to visible text |
| `%` | jump to matching bracket |
| `Ctrl-o` / `Ctrl-i` | back / forward in jump history |
| `gd` → `Ctrl-o` | go to definition → return |

> If you press `h`, `j`, `k`, `l`, or `w` more than 3–4 times — try `s`, `f`, `/`, or `Ctrl-d` / `Ctrl-u`.

---

## 3. Tabs and buffers (navigation)

The top bar shows **buffers** (bufferline), not classic vim-tabs:

### Buffers (like tabs at the top)

| Key | Action |
|--------|-----|
| `Shift-h` / `Shift-l` | previous / next buffer |
| `[b` / `]b` | same |
| `␣,` | buffer list (picker) |
| `␣bd` | close current buffer |
| `␣bo` | close other buffers |
| `␣bb` / `␣\`` | switch to previous |

### Windows inside a tab

| Key | Action |
|--------|-----|
| `Ctrl-h/j/k/l` | between windows |
| `␣\|` / `␣-` | split right / down |
| `␣wd` | close window |

For daily work, **`Shift-h` / `Shift-l`** + **`␣bd`** is almost always enough.

---

## 4. Personal config: most useful shortcuts

### Project navigation

| Key | Action |
|--------|-----|
| `␣␣` / `␣ff` | **Jump to file** — file search (project root) |
| `␣fF` | files from current cwd |
| `␣fg` | git-tracked files only |
| `␣fr` | recent files |
| `␣fp` | **Projects selector** — project picker |
| `␣fc` | Neovim config files |
| `␣e` | file explorer (root) |
| `␣E` | file explorer (cwd) |
| `␣/` / `␣sg` | grep across the project |
| `␣sw` | grep word under cursor |
| `␣sk` | search all keymaps |

### Git

| Key | Action |
|--------|-----|
| `␣gs` | **Git status** (picker) |
| `␣gd` | git diff (hunks) |
| `␣gl` | git log |
| `␣gb` | blame current line |
| `␣gf` | history of the current file |
| `␣gg` | focus Herdr tab `lg` (lazygit); create if missing |
| `␣gH` | focus Herdr tab `hunk` (`hunk diff --watch`); create if missing |
| `␣gB` | open file in browser (GitHub, etc.) |

### LSP / code

| Key | Action |
|--------|-----|
| `gd` | go to definition |
| `gr` | references |
| `gI` | go to implementation |
| `gy` | go to type definition |
| `K` | documentation / hover |
| `␣ca` | code action |
| `␣cr` | rename |
| `␣cf` | format |
| `␣cd` | line diagnostics |
| `]d` / `[d` | next / previous diagnostic |
| `]e` / `[e` | next / previous ERROR |
| `␣ss` | symbols in file |
| `␣sS` | symbols in workspace |

### UI / tools

| Key | Action |
|--------|-----|
| `␣pu` | update plugins (`vim.pack`) |
| `␣pi` | sync plugins from lockfile |
| `␣po` | check updates offline |
| `␣pc` | remove inactive plugins |
| `␣pm` / `:Mason` | LSP / formatters / linters |
| `␣uC` | colorscheme picker |
| `␣un` | dismiss notifications (if any) |
| `␣sm` | marks |
| `␣sj` | jumps |
| `␣su` | undotree |

### Explorer (sidebar)

| Key | Action |
|--------|-----|
| `j` / `k` | down / up |
| `l` / `Enter` | open / expand |
| `h` | collapse folder |
| `Backspace` | level up |
| `a` | new file/folder |
| `d` | delete |
| `r` | rename |
| `H` | toggle hidden (dotfiles) |
| `I` | toggle gitignored |
| `q` | close |

---

## 5. Modes

| Key | Action |
|--------|-----|
| `i` | insert — insert before cursor |
| `a` | append — insert after cursor |
| `I` | insert at start of line |
| `A` | append at end of line |
| `o` | new line below + insert |
| `O` | new line above + insert |
| `v` | visual — character selection |
| `V` | visual line — whole lines |
| `Ctrl-v` | visual block — rectangle |
| `Esc` / `Ctrl-[` | back to normal |
| `:` | command-line (commands) |
| `R` | replace — replace characters |

---

## 6. Cursor motion (normal)

| Key | Action |
|--------|-----|
| `h` `j` `k` `l` | left / down / up / right |
| `w` | next word |
| `b` | previous word |
| `e` | end of word |
| `W` `B` `E` | same, but whitespace-delimited (WORD) |
| `0` | start of line |
| `^` | first non-whitespace character |
| `\$` | end of line |
| `gg` | start of file |
| `G` | end of file |
| `50G` / `:50` | line 50 |
| `Ctrl-d` / `Ctrl-u` | half screen down / up |
| `Ctrl-f` / `Ctrl-b` | page down / up |
| `zz` | center line on screen |
| `%` | matching bracket `()[]{}` |
| `f{c}` | forward to character `c` on the line |
| `F{c}` | backward to character `c` |
| `t{c}` | before character `c` |
| `;` / `,` | repeat / reverse last `f`/`t` |
| `{` / `}` | previous / next paragraph |
| `*` / `#` | next / previous occurrence of the word under the cursor |
| `Ctrl-o` / `Ctrl-i` | back / forward on the jump list |
| `gd` | go to definition (LSP) |
| `gr` | references (LSP) |
| `K` | hover / documentation (LSP) |

---

## 7. Editing: delete / change / yank

In vim, an operation = **operator + motion** (or text-object).

### Operators

| Key | Action |
|--------|-----|
| `d` | delete (cut) |
| `c` | change (cut + insert) |
| `y` | yank (copy) |
| `x` | delete character under cursor |
| `X` | delete character to the left |
| `s` | substitute character (like `cl`) |
| `r{c}` | replace one character with `c` |
| `u` | undo |
| `Ctrl-r` | redo |
| `.` | repeat last change |
| `p` / `P` | paste after / before |
| `>>` / `<<` | increase / decrease indent |
| `=` | autoformat (motion/selection) |
| `gcc` | comment line (LazyVim) |
| `gc` + motion / visual | comment range |

### Most popular combos

| Key | Mnemonic | Action |
|--------|-----------|-----|
| `dw` | delete word | delete word forward |
| `daw` | delete a word | word + surrounding spaces |
| `diw` | delete inner word | only the word under the cursor |
| `cw` / `ciw` | change word | replace word |
| `yw` / `yiw` | yank word | copy word |
| `dd` | delete line | cut line |
| `cc` / `S` | change line | replace the whole line |
| `yy` / `Y` | yank line | copy line |
| `D` | delete to end | from cursor to end of line |
| `C` | change to end | same + insert |
| `d$` | | like `D` |
| `d0` | | to start of line |
| `dG` | | to end of file |
| `dgg` | | to start of file |
| `di"` / `da"` | inner/a quotes | inside / including quotes `"..."` |
| `di'` / `da'` | | same for `'` |
| `di(` / `da(` | | inside / including parentheses |
| `di[` / `da[` | | square brackets |
| `di{` / `da{` | | curly braces |
| `dit` / `dat` | tag | HTML/XML tag |
| `dip` / `dap` | paragraph | paragraph |
| `ci"` | change in quotes | replace contents of `"..."` |
| `yi"` | yank in quotes | copy contents of `"..."` |
| `viw` | visual inner word | select word |
| `vap` | visual a paragraph | select paragraph |
| `xp` | | swap two characters |
| `ddp` | | swap two lines |

### Counts

A number before a command repeats it:

| Example | Action |
|--------|-----|
| `3j` | down 3 lines |
| `2dd` | delete 2 lines |
| `5yy` | yank 5 lines |
| `d3w` | delete 3 words |
| `c2iw` | change 2 words |

---

## 8. Visual mode

| Key | Action |
|--------|-----|
| `v` / `V` / `Ctrl-v` | character / line / block |
| `o` | jump to the other end of the selection |
| `d` / `c` / `y` | delete / change / yank selection |
| `>` / `<` | indent selection |
| `=` | format selection |
| `gc` | comment selection |
| `u` / `U` | lower / upper case (in visual) |
| `Esc` | cancel selection |

---

## 9. Search and replace

| Key | Action |
|--------|-----|
| `/text` | search forward |
| `?text` | search backward |
| `n` / `N` | next / previous occurrence |
| `*` / `#` | word under cursor forward / backward |
| `:noh` | clear search highlight (`Esc` in LazyVim also clears it) |
| `:s/old/new/` | replace first match on the line |
| `:s/old/new/g` | all on the line |
| `:%s/old/new/g` | in the whole file |
| `:%s/old/new/gc` | with confirmation |
| `:nohlsearch` | disable highlight |

In visual: select → `:` → `:'<,'>s/...` appears

---

## 10. Files, save, quit

| Key / command | Action |
|-------------------|-----|
| `:w` / `Ctrl-s` | save |
| `:q` | quit |
| `:q!` | quit without saving |
| `:wq` / `:x` / `ZZ` | save and quit |
| `ZQ` | quit without saving |
| `:e file` | open file |
| `:e!` | reload from disk (discard changes) |
| `␣qq` | quit all of Neovim (`qa`) |

---

## 11. Registers (vim clipboard)

| Key | Action |
|--------|-----|
| `"ayiw` | yank word into register `a` |
| `"ap` | paste from register `a` |
| `"+y` | yank to system clipboard |
| `"+p` | paste from system clipboard |
| `""` | unnamed (last yank/delete) |
| `"0` | last yank (not delete) |
| `␣s"` | view registers (picker) |

In LazyVim the clipboard is often already linked to the system — ordinary `y`/`p` may work with the OS pasteboard.

---

## Notes

- Personal (default): `~/dotfiles/nvim/.config/nvim/` → `~/.config/nvim`
  - hotkeys: `lua/core/keymaps.lua`
  - plugins/modules: `lua/{ui,editor,lang,lsp,completion}/`
- LazyVim: `~/dotfiles/nvim/.config/lazyvim/` → `~/.config/lazyvim`
  - hotkeys: `lua/config/keymaps.lua`
  - plugins: `lua/plugins/*.lua`
- This file is **not** part of Neovim runtime — it is a cheat sheet in the repo.
