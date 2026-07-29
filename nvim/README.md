# Personal Neovim config

Personal Neovim 0.12+ configuration based on a snapshot of
[Kickstart.nvim](https://github.com/nvim-lua/kickstart.nvim) commit
`f0a2108ed51547793c758d9318bad94f242b22e5`.

Kickstart is source material, not a runtime dependency. The copied files are now
owned and maintained as part of this dotfiles repository.

## Run

```sh
nvim
```

This is now the default Neovim config (`~/.config/nvim`). The previous LazyVim
setup lives at `~/.config/lazyvim` — run it with `nvim-lazy`
(`NVIM_APPNAME=lazyvim nvim`). Separate `NVIM_APPNAME` values keep config,
plugins, state, and cache of the two setups apart.

## Plugin management

Plugins are managed by Neovim's built-in `vim.pack`. The lockfile
`nvim-pack-lock.json` is tracked in Git.

Inspect pending updates without fetching:

```vim
:lua vim.pack.update(nil, { offline = true })
```

Fetch and review updates:

```vim
:lua vim.pack.update()
```

`init.lua` is a thin bootstrap that `require`s modules under `lua/`:
`core/`, `ui/`, `editor/`, `lang/`, `lsp/`, `completion/`, plus top-level
`defer.lua` / `pack.lua`. Filetype-local maps live in `ftplugin/`.
Each `vim.pack` plugin group lives in its own file (e.g. `lsp/lsp.lua`,
`editor/snacks.lua`). Edit the matching module instead of growing
`init.lua`. Optional system check: `:checkhealth nvim_personal`.
