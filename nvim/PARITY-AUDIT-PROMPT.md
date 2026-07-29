# LazyVim → personal config parity audit prompt

Prompt for a fresh agent session. Run it whenever you need to check the
current parity state between `.config/lazyvim/` and `.config/nvim/`.
Project context: [AGENTS.md](AGENTS.md). Intentional differences:
[CHANGELOG.md](CHANGELOG.md).

---

I am migrating from the LazyVim setup (`.config/lazyvim/`) to my own fully controlled config `.config/nvim/`. Perform a fresh full audit of their functional parity.

## Goal

This personal config should reproduce the useful, actual functionality of the current LazyVim setup (`.config/lazyvim/`), but without depending on LazyVim as a framework. The config must stay simple, explicit, and fully under my control: unnecessary parts can be skipped, and needed parts implemented directly.

Compare not just plugin lists, but also **how exactly each feature is configured and behaves**:

- installed plugins and their settings;
- options, autocmds, and keymaps;
- LSP servers, capabilities, actions, and file operations;
- completion, snippets, and command-line completion;
- formatting and linting, including formatter order;
- Treesitter parsers, filetype overrides, and textobjects;
- diagnostics, picker, explorer, buffers, sessions, terminal;
- Git UX;
- UI and everyday LazyVim muscle memory;
- any other functionality actually available to the user.

## Sources

The configs live in this dotfiles repository:

- `nvim/.config/lazyvim/` — the current LazyVim setup;
- `nvim/.config/nvim/` — my own config.

1. Read `nvim/.config/lazyvim/lazy-lock.json` and find the exact `LazyVim` commit.
2. Download that exact upstream `LazyVim/LazyVim` commit into a temporary directory outside the repo, e.g. `/tmp/LazyVim-<commit>`.
3. Analyze the effective combination of:
   - upstream LazyVim defaults;
   - extras from `nvim/.config/lazyvim/lazyvim.json`;
   - local overrides from `nvim/.config/lazyvim/lua/`;
   - the actual lockfiles of both configs.
4. Clearly distinguish upstream defaults, enabled extras, and local overrides.
5. **You must read [CHANGELOG.md](CHANGELOG.md)** before the audit. Treat
   everything documented there (deliberate exclusions, personal-only
   features, iterative changes) as **intentional and known**: do not count it
   as a gap, do not suggest "restoring it to match LazyVim", and do not
   present it as an unexpected difference. If the actual behavior contradicts
   the CHANGELOG, flag that separately as a documentation discrepancy.

## What NOT to compare or port

- Anything already listed in [CHANGELOG.md](CHANGELOG.md) as a deliberate decision (do not re-report it as a gap).
- Do not compare package-manager implementation: `lazy.nvim` vs `vim.pack`. The `vim.pack` implementation in personal is fine as is.
- Do not add the LazyVim framework or `lazy.nvim` to personal.
- Do not add folding: I deliberately do not use it and dislike it.
- Do not add DAP/debugger, debug adapters, debugger keymaps, or dependencies: I do not use a debugger.
- Do not port language extras just because they are enabled in the old LazyVim setup.

## Language scope

Compare in detail only the languages and filetypes actually present or explicitly configured in the personal config at the time of the audit.

Git language support should be considered desirable: verify Treesitter/filetype behavior for `gitcommit`, `gitconfig`, `gitrebase`, `gitignore`, and `gitattributes`. Do not add `cmp-git` if the current completion engine is Blink and the upstream extra wires it only for `nvim-cmp`.

For languages that exist only in `.config/lazyvim/` but are absent in personal, create a separate "do not port without a separate decision" list. In particular, Go, Python, and Terraform should not be added automatically.

## Delegation

Use separate read-only subagents if available:

1. One agent separately dissects the exact upstream LazyVim snapshot and builds a map of the effective setup.
2. Others independently compare:
   - plugins and user-visible feature coverage;
   - LSP/languages/completion/formatting/linting/Treesitter;
   - core UX/options/keymaps/autocmds/UI/session/navigation.
3. Then verify the agents' critical claims yourself against the local code. Do not accept their conclusions without verification.

Do not have agents edit the same files in parallel.

## Result format

Prepare a single consolidated report with these sections:

1. **Executive summary** — approximate parity level and the biggest differences.
2. **Effective plugin/feature matrix**:
   - equivalent;
   - LazyVim-only;
   - personal-only;
   - same plugin, different behavior.
3. **Language matrix** for the in-scope languages:
   - LSP;
   - capabilities/settings;
   - formatters and their order;
   - linters;
   - completion sources;
   - Treesitter parsers/filetype overrides;
   - keymaps/actions.
4. **Core UX matrix** — options, autocmds, diagnostics, picker/explorer, buffers, sessions, terminal, Git, UI.
5. **Intentional differences** — package manager, no folding, no debugger, excluded languages.
6. **Ranked gaps**:
   - Must;
   - Should;
   - Optional;
   - Do not copy.
7. For each gap provide:
   - the actual behavioral difference;
   - exact source paths;
   - the minimal recommended change;
   - possible tradeoffs.

Do not conclude from the lockfile alone: a plugin being present does not mean it is active or configured.

## Applying changes

First do the audit and show the report. Do not edit the config automatically until I confirm a ranked plan.

After my confirmation:

- do only the agreed Must/Should/Optional items;
- changes must be minimal and surgical;
- do not reformat unrelated lines or whole files unnecessarily;
- do not change the package-manager architecture or lockfiles without need;
- verify Lua syntax, `git diff --check`, and headless startup via `nvim --headless`;
- for a non-trivial diff run a separate read-only review;
- separately list everything that needs manual verification in a real TypeScript/Angular/ESLint/Git project.

---
