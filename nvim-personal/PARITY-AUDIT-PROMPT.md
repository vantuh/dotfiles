# LazyVim → nvim-personal parity audit prompt

Промпт для нової сесії агента. Запускати коли потрібно перевірити
актуальний стан parity між `nvim/` і `nvim-personal/`. Попередні результати:
[PARITY-AUDIT.md](PARITY-AUDIT.md) (V1), [PARITY-AUDIT-V2.md](PARITY-AUDIT-V2.md) (V2).
Контекст проєкту: [AGENTS.md](AGENTS.md).

---

Я переходжу з `nvim/` (LazyVim setup) на власний повністю контрольований конфіг `nvim-personal/`. Проведи повторний повний аудит їхньої функціональної відповідності.

## Мета

`nvim-personal` має відтворювати корисний фактичний функціонал поточного `nvim/`, але без залежності від LazyVim як framework. Конфіг має залишатися простим, явним і повністю під моїм контролем: зайве можна не переносити, а потрібні частини реалізовувати напряму.

Порівнюй не лише списки плагінів, а й те, **як саме налаштована та поводиться кожна функція**:

- встановлені плагіни та їхні налаштування;
- options, autocmds і keymaps;
- LSP servers, capabilities, actions і file operations;
- completion, snippets і command-line completion;
- formatting та linting, включно з порядком formatter-ів;
- Treesitter parsers, filetype overrides і textobjects;
- diagnostics, picker, explorer, buffers, sessions, terminal;
- Git UX;
- UI та щоденна LazyVim muscle memory;
- інший фактично доступний користувачу функціонал.

## Джерела

Конфіги знаходяться в цьому dotfiles-репозиторії:

- `nvim/.config/nvim/` — актуальний LazyVim setup;
- `nvim-personal/.config/nvim-personal/` — власний конфіг.

1. Прочитай `nvim/.config/nvim/lazy-lock.json` і знайди точний commit `LazyVim`.
2. Завантаж цей точний commit upstream `LazyVim/LazyVim` у тимчасову директорію поза репозиторієм, наприклад `/tmp/LazyVim-<commit>`.
3. Аналізуй ефективну комбінацію:
   - upstream LazyVim defaults;
   - extras із `nvim/.config/nvim/lazyvim.json`;
   - локальні overrides із `nvim/.config/nvim/lua/`;
   - фактичні lockfiles обох конфігів.
4. Чітко відрізняй upstream defaults, enabled extras і локальні overrides.

## Що не порівнювати і не переносити

- Не порівнюй package-manager implementation: `lazy.nvim` проти `vim.pack`. Реалізація `vim.pack` у personal нас влаштовує.
- Не додавай LazyVim framework або `lazy.nvim` у personal.
- Не додавай folding: я навмисно його не використовую і не люблю.
- Не додавай DAP/debugger, debug adapters, debugger keymaps або залежності: я debugger не використовую.
- Не перенось language extras лише тому, що вони ввімкнені у старому LazyVim setup.

## Language scope

Детально порівнюй лише мови та filetypes, які фактично присутні або явно налаштовані в `nvim-personal` на момент аудиту.

Git language support потрібно вважати бажаним: перевір Treesitter/filetype-поведінку для `gitcommit`, `gitconfig`, `gitrebase`, `gitignore` і `gitattributes`. Не додавай `cmp-git`, якщо поточний completion engine — Blink і upstream extra підключає його лише для `nvim-cmp`.

Для мов, які є лише в `nvim/`, але відсутні в personal, створи окремий список «не переносити без окремого рішення». Зокрема Go, Python і Terraform не слід автоматично додавати.

## Делегування

Використай окремих read-only субагентів, якщо вони доступні:

1. Один агент окремо розбирає точний upstream LazyVim snapshot і формує карту effective setup.
2. Інші незалежно порівнюють:
   - plugins та user-visible feature coverage;
   - LSP/languages/completion/formatting/linting/Treesitter;
   - core UX/options/keymaps/autocmds/UI/session/navigation.
3. Після цього сам перевір критичні твердження агентів за локальним кодом. Не приймай їхні висновки без верифікації.

Не доручай агентам редагувати ті самі файли паралельно.

## Формат результату

Підготуй один зведений звіт із такими розділами:

1. **Executive summary** — приблизний рівень parity та найбільші відмінності.
2. **Effective plugin/feature matrix**:
   - equivalent;
   - LazyVim-only;
   - personal-only;
   - same plugin, different behavior.
3. **Language matrix** для мов у scope:
   - LSP;
   - capabilities/settings;
   - formatter-и та їхній порядок;
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
7. Для кожного gap наведи:
   - фактичну поведінкову різницю;
   - точні source paths;
   - мінімальну рекомендовану зміну;
   - можливі tradeoffs.

Не роби висновок лише з lockfile: наявність плагіна не означає, що він активний або налаштований.

## Виконання змін

Спочатку проведи аудит і покажи звіт. Не редагуй конфіг автоматично до мого підтвердження ranked plan.

Після мого підтвердження:

- роби лише погоджені Must/Should/Optional пункти;
- зміни мають бути мінімальними та хірургічними;
- не форматуй сторонні рядки або цілі файли без необхідності;
- не змінюй package-manager architecture чи lockfiles без потреби;
- перевір Lua syntax, `git diff --check` і headless startup через `NVIM_APPNAME=nvim-personal nvim --headless`;
- для нетривіального diff запусти окремий read-only review;
- окремо переліч усе, що потребує ручної перевірки у реальному TypeScript/Angular/ESLint/Git проєкті.

---
