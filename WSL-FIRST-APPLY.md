# WSL first apply (one-shot)

Follow this file on **WSL**, not PowerShell. Do the apply first. Delete this
file and the migration scripts **only after validation passes**.

Do not push. Commit locally when the cleanup is done. Stop and report if a
check fails.

## Constraints

- WSL Linux user can be anything. Do not rename it to `vantuh`.
- Windows user is `Ivan` (`DOTFILES_USER` in `home/dot_zshenv`). Terminal sync
  reads `%USERNAME%` via `cmd.exe`; do not hardcode another Windows user
  unless `echo %USERNAME%` is not `Ivan`.
- Clone **must** stay at `~/dotfiles`. Never `chezmoi init` without
  `--source ~/dotfiles` (that clones into `~/.local/share/chezmoi`).
- Apply deploys configs only. It does not install brew packages.
- Do **not** delete `run_after_20-sync-windows-terminal.sh.tmpl` or
  `run_after_90-link-herdr-plugins.sh.tmpl`.

## 1. Prerequisites

Need `git`, `zsh`, `chezmoi`, Linuxbrew
(`/home/linuxbrew/.linuxbrew/bin/brew`), JetBrainsMono Nerd Font on Windows.

If `chezmoi` is missing: `brew install chezmoi`. If brew is missing, install
Linuxbrew first.

Confirm WSL:

```bash
uname -r | grep -qi microsoft
echo "linux=$USER windows=$(cmd.exe /C 'echo %USERNAME%' | tr -d '\r') distro=${WSL_DISTRO_NAME:-?}"
```

Windows Terminal profiles use `-d Ubuntu`. If `WSL_DISTRO_NAME` is not
`Ubuntu`, say so and do not rewrite the profile unless asked.

## 2. Init + apply

```bash
# clone only if missing
[[ -d ~/dotfiles/.git ]] || git clone git@github.com:vantuh/dotfiles.git ~/dotfiles
cd ~/dotfiles

chezmoi init --source ~/dotfiles
chezmoi diff
chezmoi apply
chsh -s "$(command -v zsh)"
```

If `diff` would clobber unexpected secrets or unrelated files, stop.

Expected first-apply side effects:

- Stow symlinks into **this** clone (`~/dotfiles/zsh/...`, `nvim/...`,
  `pi/...`, `omp/...`, …) are removed.
- Regular files `~/.pi/agent/pi-autoname.json`, `~/.omp/agent/config.yml`,
  `~/.omp/agent/kiro-acp.json` are copied to `*.pre-chezmoi.<timestamp>`
  before replace.
- Windows Terminal `settings.json` is linked, or copied if the NTFS symlink
  fails.

## 3. Validate

All of these must hold:

```bash
# chezmoi still uses this clone
chezmoi source-path | grep -qx "$HOME/dotfiles/home"
test -z "$(chezmoi diff)"

# shell identity (sourced, not assumed from $USER)
zsh -lic '[[ $DOTFILES_PLATFORM == wsl && $DOTFILES_USER == Ivan ]]'

# managed targets exist; not leftover Stow links into ~/dotfiles/{zsh,nvim,pi,omp}/
for f in ~/.zshrc ~/.zshenv ~/.zshrc.d ~/.config/nvim ~/.config/herdr ~/.pi/agent ~/.omp/agent; do
  [[ -e $f ]] || { echo "missing $f"; exit 1; }
  if [[ -L $f ]]; then
    t=$(readlink -f "$f")
    case $t in
      "$HOME/dotfiles/zsh/"*|"$HOME/dotfiles/nvim/"*|"$HOME/dotfiles/pi/"*|"$HOME/dotfiles/omp/"*)
        echo "stow leftover: $f -> $t"; exit 1;;
    esac
  fi
done

# ~/.agents and OMP live-linked configs point into the repo
[[ $(readlink -f ~/.agents) == "$HOME/dotfiles/home/.agents" ]]
[[ $(readlink -f ~/.omp/agent/config.yml) == "$HOME/dotfiles/home/dot_omp/private_agent/.config.yml" ]]
[[ $(readlink -f ~/.omp/agent/kiro-acp.json) == "$HOME/dotfiles/home/dot_omp/private_agent/.kiro-acp.json" ]]

# WSL-only targets present; macOS-only absent
[[ -e ~/.config/llama-swap && -x ~/.local/bin/llama-update ]]
[[ ! -e ~/.config/karabiner ]]

# Windows Terminal settings reached the Windows user profile
win=$(cmd.exe /C "echo %USERNAME%" | tr -d '\r')
find "/mnt/c/Users/$win/AppData/Local/Packages" -maxdepth 2 -name settings.json \
  -path '*WindowsTerminal*' -print -quit | grep -q .
```

Also: `~/.tokens` is local and must not be committed. Login shell should be
zsh (`getent passwd "$USER"`). Open a new terminal; zinit may download
plugins on first interactive launch — that is expected.

## 4. After validation: delete this job

Only if section 3 passed:

1. Delete `WSL-FIRST-APPLY.md` (this file).
2. Delete migration-only scripts:
   - `home/.chezmoiscripts/run_once_before_00-migrate-from-stow.sh.tmpl`
   - `home/.chezmoiscripts/run_once_before_01-clean-stow-leaves.sh.tmpl`
3. In `README.md`, drop the sentence about the first apply removing Stow
   symlinks / backing up Pi/OMP files. Keep the Windows Terminal sentence.
4. In `AGENTS.md`, change “Migration and post-apply integration scripts” to
   post-apply integration only.
5. Leave `home/.chezmoiremove` and both `run_after_*.tmpl` scripts.
6. `chezmoi apply` once more; `chezmoi diff` must still be empty.
7. Commit locally. Do not push.

Report: apply ok / validation / files deleted / commit hash.
