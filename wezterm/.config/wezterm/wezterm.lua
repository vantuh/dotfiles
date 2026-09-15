-- WezTerm config for Windows (deployed from WSL dotfiles via install.sh).
-- Mirrors: alacritty/.config/alacritty/windows.toml (shell, font size) + base.toml (Catppuccin Mocha).
-- WezTerm hot-reloads this file on save: edit + Ctrl+S = instant preview.

local wezterm = require 'wezterm'
local act = wezterm.action
local config = wezterm.config_builder()

-- --- Theme: Catppuccin Mocha (built-in, replaces hand-written palette) ---
config.color_scheme = 'Catppuccin Mocha'

-- --- Font ---
config.font = wezterm.font('JetBrainsMonoNL Nerd Font', { weight = 'Light' })
config.font_size = 12.0 -- same as alacritty windows.toml

-- --- Rendering: WebGPU -> DirectX 12 ---
config.front_end = 'WebGpu'

-- --- Window ---
config.window_padding = { left = 0, right = 0, top = 0, bottom = 0 }
config.window_close_confirmation = 'NeverPrompt' -- = confirm-close-surface = false
config.initial_cols = 200
config.initial_rows = 50

-- --- Shell: herdr in WSL (same recipe as alacritty windows.toml) ---
config.default_prog = { 'wsl.exe', '--cd', '~', '--', '/home/linuxbrew/.linuxbrew/bin/herdr' }

-- --- Image protocols (the main reason to try WezTerm on Windows) ---
config.enable_kitty_graphics = true

-- --- Keys ---
config.keys = {
  -- Ctrl+Shift+V/C (also WezTerm defaults, kept explicit)
  { key = 'V', mods = 'CTRL|SHIFT', action = act.PasteFrom 'Clipboard' },
  { key = 'C', mods = 'CTRL|SHIFT', action = act.CopyTo 'ClipboardAndPrimarySelection' },
  -- shift+Enter -> \x1b[13;2u
  { key = 'Enter', mods = 'SHIFT', action = act.SendString '\x1b[13;2u' },
  -- Let Herdr receive Alt+Arrows instead of WezTerm translating to Alt+B/F.
  { key = 'LeftArrow', mods = 'ALT', action = act.DisableDefaultAssignment },
  { key = 'RightArrow', mods = 'ALT', action = act.DisableDefaultAssignment },
}

return config
