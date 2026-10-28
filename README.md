# dotfiles

Cross-platform macOS and WSL dotfiles managed with [chezmoi](https://www.chezmoi.io/).

## Layout

`.chezmoiroot` points chezmoi at `home/`. Paths below that directory map
one-to-one to `$HOME` using chezmoi's source-state naming:

| Source | Target |
| --- | --- |
| `home/dot_zshrc` | `~/.zshrc` |
| `home/dot_config/nvim` | `~/.config/nvim` |
| `home/dot_config/herdr` | `~/.config/herdr` |
| `home/dot_config/rex/init.lua` | `~/.config/rex/init.lua` |
| `home/dot_config/llama-swap` | `~/.config/llama-swap` (WSL) |
| `home/dot_config/ghostty` | `~/.config/ghostty` (macOS) |
| `home/dot_config/lazygit` | `~/.config/lazygit` |
| `home/dot_local/bin` | `~/.local/bin` |
| `home/dot_pi/private_agent` | `~/.pi/agent` |
| `home/dot_omp/private_agent` | `~/.omp/agent` (`0700`) |
| `home/dot_omp/private_agent/.config.yml` | `~/.omp/agent/config.yml` (symlink into the repo) |
| `home/dot_omp/private_agent/.kiro-acp.json` | `~/.omp/agent/kiro-acp.json` (symlink into the repo) |
| `home/dot_pi/private_agent/.settings.json` | `~/.pi/agent/settings.json` (symlink into the repo) |
| `home/dot_pi/private_agent/.agents` | `~/.pi/agent/agents` (symlink into the repo; dot-named so chezmoi ignores the role files) |
| `home/dot_pi/profiles/work/private_agent` | `~/.pi/profiles/work/agent` (Pi work profile; `piw`) |
| `home/dot_pi/profiles/work/private_agent/.settings.json` | `~/.pi/profiles/work/agent/settings.json` (symlink into the repo) |
| `home/.agents` | `~/.agents` (symlink into the repo) |

`home/.chezmoiignore.tmpl` selects platform-specific targets. macOS receives
Karabiner and Ghostty. Lazygit uses `~/.config/lazygit` on both platforms
(macOS needs `CONFIG_DIR`). WSL additionally receives `llama-update`,
`~/.config/llama-swap`, and Windows Terminal settings.

Repository-only content stays outside `home/`:

| Directory | Contents |
| --- | --- |
| `fan_control` | Fan Control config and research notes |
| `openspec` | OpenSpec design documents |
| `.githooks` | Git hooks for this repository, enabled per clone (see [Commit message hook](#commit-message-hook)) |
| `archive` | Retired tmux and Alacritty configs, the Herdr `my-usage` and `nvim-cheatsheet` plugins with the `my-usage` CLIs, and the nvim `COMMANDS.md` cheatsheet; never applied |

## Prerequisites

- [chezmoi](https://www.chezmoi.io/install/)
- Git
- [Homebrew](https://brew.sh/) on macOS or
  [Linuxbrew](https://docs.brew.sh/Homebrew-on-Linux) on WSL
- [JetBrainsMono Nerd Font](https://www.nerdfonts.com/font-downloads)

## Installation

```bash
git clone git@github.com:vantuh/dotfiles.git ~/dotfiles
chezmoi init --source ~/dotfiles --apply
chsh -s "$(command -v zsh)"
```

The generated chezmoi config keeps the clone as `sourceDir`. On WSL, an apply
also links (or copies, if Windows symlink creation is unavailable) Windows
Terminal settings.

Restart the terminal after the first apply. Zinit installs shell plugins on the
first interactive launch.

## Commit message hook

`.githooks/commit-msg` rejects commit subjects that are not Conventional
Commits. Enable it once per clone — git does not run any hook setup on clone:

```bash
git config core.hooksPath .githooks
```

## Daily workflow

Edit files in this repository, never the generated copies under `$HOME`.
Oh My Pi and Pi are the exceptions: `~/.omp/agent/config.yml`,
`~/.omp/agent/kiro-acp.json`, `~/.pi/agent/settings.json`, and the work
profile's `~/.pi/profiles/work/agent/settings.json` are dest-symlinks into the
repo, so UI or in-place edits land in git. OMP's atomic writer preserves those symlink
targets; Pi rewrites its JSON files in place (`settings.json` under a
`settings.json.lock` guard that never enters the repo). Leave nvim, zsh, herdr,
and the OMP kiro-acp extension tree as regular applied files.

```bash
chezmoi diff
chezmoi apply
chezmoi update
```

`chezmoi apply <target>` limits an apply to one target or subtree. The `dotfix`
shell helper runs `chezmoi update`.

## Rex shortcuts

`home/dot_config/rex/init.lua` ports the Herdr shortcuts and the matching archived
tmux bindings. Rex sessions correspond to Herdr workspaces. Physical key bindings
work in both English and Ukrainian layouts; the labels below use the US layout.

| Shortcut | Action |
| --- | --- |
| `Ctrl+A`, then `S` | Session picker |
| `Ctrl+A`, then `C` / `,` | New tab / rename tab |
| `Ctrl+A`, then `\|` / `-` | Split right / down |
| `Ctrl+A`, then `X` / `Z` / `B` | Close pane / zoom / toggle sidebar |
| `Ctrl+A`, then `Ctrl+A` | Send `Ctrl+A` to the terminal (including nested tmux) |
| `Shift+Left` / `Shift+Right` | Previous / next tab |
| `Alt+Arrow` | Focus pane in that direction |
| `Alt+1` … `Alt+9` | Select tab by index |
| `Ctrl+Shift+1` … `Ctrl+Shift+9` | Select session in server order |

`Escape` cancels a prefix sequence. Pane closing uses Rex's native behavior, not
our tmux confirmation prompt. Herdr's picker-only `J`/`K`/arrow navigation is not
bound globally, so ordinary terminal input remains intact. Other Rex defaults stay
unchanged; shortcuts set in the Rex UI take priority over this file.

```bash
luajit tests/rex-config.lua
chezmoi apply ~/.config/rex/init.lua
rex config check
rex config reload
```

### Ghostty appearance

Rex's theme is rendered from the color settings in
`home/dot_config/ghostty/config.ghostty.tmpl`, without its Herdr command.
`run_after_40-configure-rex.sh.tmpl` also derives the font family, style, and size
from that file and writes only those macOS preferences plus an empty startup
command (Rex's default shell). No account, connection, or session data is managed.

On macOS, `chezmoi apply` imports changed theme colors through the running Rex app.
Enable **Settings → Rex Server → Remote Control**. If Rex is closed, the import
stays pending until the next apply while Rex is open. A local hash avoids creating
a new custom theme on every apply. Color changes create a new imported theme;
existing themes are preserved. Font preferences may need Rex to be reopened.
`rex config reload` reloads Lua shortcuts, not macOS font preferences.

`Shift+Enter` sends the same CSI-u sequence as Ghostty. Karabiner maps
`Ctrl+Shift+C/V` to native `Cmd+C/V` only in Rex. Native `Cmd+C/V` remain unchanged.
The port does not force Ghostty's zero padding, maximized window, Option-key mode,
close confirmation, clipboard permissions, or `Cmd+Space` handling: these do not
have verified equivalents in the current Rex Lua/client API. Existing settings
for those features are left alone.

```bash
bun tests/rex-settings.ts
chezmoi apply
```

## Shared agent skills

`home/.agents/` is the source of truth for skills and shared instructions.
It is named `.agents` rather than `dot_agents` so chezmoi ignores the files
(source entries starting with `.` are not applied) and only the symlink is
applied. Chezmoi creates `~/.agents` as a symlink to that directory, then
links its `skills` and `AGENTS.md` into Pi, OpenCode, Kiro, and Claude as
appropriate. Writes through any linked agent path therefore update the
repository.

To add a shared skill, create
`home/.agents/skills/<name>/SKILL.md`, then run `chezmoi apply`.

Upstream skills are refreshed with `skills-update`, which drives the
[`skills`](https://github.com/vercel-labs/skills) CLI from `~/.agents` where
`skills-lock.json` lives:

```bash
skills-update
```

The CLI treats the working directory as its project root and writes the
canonical copy to `<cwd>/.agents/skills`. `home/.agents/.agents/skills` is
therefore a symlink to `../skills` so the update lands in the repository
directory and propagates through every agent link. Do not flatten or delete
that symlink. The CLI also creates `~/.agents/.claude/`, which is unused and
git-ignored. Hand-written skills in the same directory are not listed in
`skills-lock.json` and are left alone.

`skills-update` runs `npx skills update` and then
`npx skills experimental_install`. The updater skips a skill whose upstream
repository publishes the same name at more than one path (it refuses to guess
which copy is current), and `caveman` is one: upstream mirrors it into
`plugins/caveman/skills/`. The second pass reinstalls every locked skill from
its recorded path, so skipped skills are still refreshed.

## Pi profiles

Pi has no `--profile` flag; isolation goes through `PI_CODING_AGENT_DIR`. `piw`
runs Pi against `~/.pi/profiles/work/agent`, a second agent directory whose
`settings.json` pins the pi-subagents roles to the work providers.

```bash
piw   # work profile
pi    # default profile
```

Everything both profiles must agree on — `extensions/`, packages (`npm/`,
`git/`), `skills/`, `prompts/`, `agents/`, `AGENTS.md`, `models.json`,
`mcp.json`, `keybindings.json`, `auth.json`, `trust.json` — is a
symlink into `~/.pi/agent` (OMP does the same under `~/.omp/profiles/work`).
Sessions, caches, and `run-history.jsonl` stay per-profile. Add another
`symlink_*.tmpl` under `home/dot_pi/profiles/work/private_agent/` for anything else that
must stay shared, or leave it out to get a fresh per-profile copy.

## Retired Pi extensions

Retired personal extensions live under `home/dot_pi/private_agent/archive/` and are
excluded from the applied state. See its `README.md` for history and restore
instructions.

## Two kiro-acp trees

`kiro-acp` is vendored separately for each host: Oh My Pi keeps its copy in this
repository, Pi loads a local package that lives outside it.

| Host | Source | Applied path |
| --- | --- | --- |
| Oh My Pi (`omp`) | `home/dot_omp/private_agent/extensions/kiro-acp` | `~/.omp/agent/extensions/kiro-acp` |
| Pi (`pi`) | `~/projects/personal/pi-kiro-acp` (local Pi package) | loaded in place, no copy under `$HOME` |

The two trees started as the same extension and then diverged; never update one
as if it were a mirror of the other.

Pi loads its copy through the `packages` entry `"~/projects/personal/pi-kiro-acp"`
in `~/.pi/agent/settings.json` and in the work profile's `settings.json`. A local
package is loaded from its directory — Pi neither installs nor copies it — so
that checkout is the source of truth for Pi. The work profile also lists it under
`subagents.defaultSubagentOnlyExtensions`, because subagent children run with a
fixed extension list rather than ambient discovery. `home/.chezmoiremove` drops
the `~/.pi/agent/extensions/kiro-acp` copy this repository used to apply; the
bundled tree and that removal entry must land in the same commit, since chezmoi
refuses to build a source state that both applies and removes one target.

The OMP tree keeps its vendored `test/` directory in the repository but out of
`$HOME`; run its checks from the repository path above. Chezmoi deploys runtime
extension files as regular files, not Stow symlinks.

Read the matching tree's `README.md` before editing, then apply that target and
run its checks.
