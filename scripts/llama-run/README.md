# llama-run

Interactive TUI launcher for `llama-server` (llama.cpp). Powered by [gum](https://github.com/charmbracelet/gum).

## Features

- **Model profiles** — per-model defaults in `llama-models.json` (context, cache type, sampling, etc.)
- **Quick launch** — select model → launch with recommended defaults, zero config
- **Custom mode** — interactively tweak every parameter with arrow-key selection
- **Live status** — shows chosen parameters as you go
- **Auto-discovery** — picks up any `.gguf` file in the models dir, even without a profile

## Dependencies

- [jq](https://jqlang.github.io/jq/) — JSON parsing
- [gum](https://github.com/charmbracelet/gum) — interactive TUI prompts

```bash
brew install jq gum
```

## Usage

```bash
# Interactive mode (uses defaults from llama-models.json)
./llama-run.sh

# Custom llama-bin directory
./llama-run.sh --dir /mnt/c/Users/Ivan/llama-bin

# Custom config file
./llama-run.sh --config /path/to/llama-models.json
```

Default `LLAMA_DIR` is `/mnt/c/Users/Ivan/llama-bin`. Override with `--dir` or `LLAMA_DIR` env var.

## Config

`llama-models.json` — array of model profiles. Each profile sets defaults for all parameters:

```json
[
  {
    "name": "Gemma 4 E4B",
    "files": [
      "gemma-4-E4B-it-Q8_0.gguf",
      "gemma-4-E4B-it-Q4_K_M.gguf"
    ],
    "alias": "gemma4-e4b-local",
    "ctx": 65536,
    "ngl": 99,
    "flash_attn": "on",
    "cache_k": "q8_0",
    "cache_v": "q8_0",
    "threads": 8,
    "port": 8080,
    "parallel": 1,
    "batch": 4096,
    "ubatch": 512,
    "jinja": "on",
    "temp": 1.0,
    "top_p": 0.95,
    "top_k": 64,
    "host": "127.0.0.1"
  }
]
```

First profile in the array is the recommended default. First file in `"files"` is the recommended GGUF variant.

If a profile has multiple files, the launcher will prompt to pick a variant after model selection.

Models found in the `models/` directory but not in the config get generic defaults.

## Parameters

| Parameter | Flag | Description |
|-----------|------|-------------|
| alias | `--alias` | Model name for `/v1/models` API |
| ctx | `-c` | Context size (tokens) |
| ngl | `-ngl` | GPU layers to offload |
| flash_attn | `--flash-attn` | Flash attention (on/off) |
| cache_k/v | `--cache-type-k/v` | KV cache quantization (f16, q8_0, q4_0) |
| threads | `-t` | CPU threads |
| host | `--host` | Listen address |
| port | `--port` | Listen port |
| parallel | `-np` | Max parallel requests |
| batch | `-b` | Batch size for prompt processing |
| ubatch | `-ub` | Micro-batch size |
| jinja | `--jinja` | Use Jinja chat templates (on/off) |
| temp | `--temp` | Sampling temperature |
| top_p | `--top-p` | Nucleus sampling |
| top_k | `--top-k` | Top-K sampling |

## File structure

```
llama-run/
├── llama-run.sh        # launcher script
├── llama-models.json   # model profiles
└── README.md
```
