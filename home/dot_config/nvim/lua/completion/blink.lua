-- Install Blink once so completion setup and LSP capabilities can share it.

vim.pack.add {
  { src = 'https://github.com/saghen/blink.cmp', version = vim.version.range '1.*' },
}

return require 'blink.cmp'
