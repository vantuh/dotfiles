#!/usr/bin/env bash
set -Eeuo pipefail

# llama-run.sh — Interactive launcher for llama-server (gum-powered)
#
# Usage:
#   ./llama-run.sh                                        # interactive mode
#   ./llama-run.sh --dir /mnt/c/Users/Ivan/llama-bin      # custom install dir
#   ./llama-run.sh --config /path/to/llama-models.json    # custom config
#   ./llama-run.sh --dry-run                               # print command, don't launch

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LLAMA_DIR="${LLAMA_DIR:-/mnt/c/Users/Ivan/llama-bin}"
MODELS_DIR="${LLAMA_DIR}/models"
CONFIG_FILE="${SCRIPT_DIR}/llama-models.json"

# ─── Parse args ──────────────────────────────────────────────────────────────

while [[ $# -gt 0 ]]; do
  case $1 in
    --dir)    LLAMA_DIR="$2"; MODELS_DIR="${LLAMA_DIR}/models"; shift 2 ;;
    --config) CONFIG_FILE="$2"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    --help|-h) echo "Usage: $0 [--dir PATH] [--config PATH] [--dry-run]"; exit 0 ;;
    *)        echo "Unknown arg: $1"; exit 1 ;;
  esac
done

# ─── Validate ────────────────────────────────────────────────────────────────

SERVER="${LLAMA_DIR}/llama-server.exe"
[[ -d "$MODELS_DIR" ]] || { echo "Models dir not found: ${MODELS_DIR}"; exit 1; }
[[ -f "$CONFIG_FILE" ]] || { echo "Config not found: ${CONFIG_FILE}"; exit 1; }
command -v jq &>/dev/null || { echo "jq is required"; exit 1; }
command -v gum &>/dev/null || { echo "gum is required (brew install gum)"; exit 1; }

# ─── Gum style ───────────────────────────────────────────────────────────────

export GUM_CHOOSE_CURSOR_FOREGROUND="212"
export GUM_CHOOSE_SELECTED_FOREGROUND="212"
export GUM_CHOOSE_HEADER_FOREGROUND="99"
export GUM_INPUT_HEADER_FOREGROUND="99"
export GUM_INPUT_CURSOR_FOREGROUND="212"
export GUM_CONFIRM_SELECTED_FOREGROUND="212"

# ─── Load config ─────────────────────────────────────────────────────────────

PROFILE_COUNT=$(jq 'length' "$CONFIG_FILE")

# ─── Collect model list ──────────────────────────────────────────────────────

GGUF_FILES=()
while IFS= read -r f; do [[ -n "$f" ]] && GGUF_FILES+=("$f"); done < <(find "$MODELS_DIR" -maxdepth 1 -name "*.gguf" | sed 's|.*/||' | sort)

# Collect all configured filenames
CONFIG_FILES=()
for (( i=0; i<PROFILE_COUNT; i++ )); do
  while IFS= read -r f; do [[ -n "$f" ]] && CONFIG_FILES+=("$f"); done < <(jq -r ".[$i].files[]" "$CONFIG_FILE")
done

# Build display list: configured first (★), then unconfigured
MODEL_ITEMS=()
MODEL_MAP_IDX=()    # parallel array: profile index (-1 = unconfigured)
MODEL_MAP_FILE=()   # parallel array: .gguf filename (only for unconfigured)

for (( i=0; i<PROFILE_COUNT; i++ )); do
  name=$(jq -r ".[$i].name" "$CONFIG_FILE")
  first_file=$(jq -r ".[$i].files[0]" "$CONFIG_FILE")
  file_count=$(jq ".[$i].files | length" "$CONFIG_FILE")
  size="missing"
  [[ -f "${MODELS_DIR}/${first_file}" ]] && size=$(du -h "${MODELS_DIR}/${first_file}" 2>/dev/null | cut -f1)
  label="★ ${name}  (${first_file}, ${size})"
  [[ $file_count -gt 1 ]] && label="★ ${name}  (${file_count} variants)"
  MODEL_ITEMS+=("$label")
  MODEL_MAP_IDX+=("$i")
  MODEL_MAP_FILE+=("")
done

for f in "${GGUF_FILES[@]}"; do
  configured=false
  for cf in "${CONFIG_FILES[@]}"; do
    [[ "$f" == "$cf" ]] && { configured=true; break; }
  done
  if ! $configured; then
    size=$(du -h "${MODELS_DIR}/${f}" 2>/dev/null | cut -f1 || echo "?")
    MODEL_ITEMS+=("  ${f}  (${size})")
    MODEL_MAP_IDX+=("-1")
    MODEL_MAP_FILE+=("$f")
  fi
done

if [[ ${#MODEL_ITEMS[@]} -eq 0 ]]; then
  echo "No models found"
  exit 1
fi

# ─── Model selection ─────────────────────────────────────────────────────────

gum style --bold --foreground 99 --border double --padding "0 2" "llama-server launcher"

CHOSEN=$(printf '%s\n' "${MODEL_ITEMS[@]}" | gum choose --header "Select model")

# Find index of chosen item
chosen_idx=-1
for i in "${!MODEL_ITEMS[@]}"; do
  [[ "${MODEL_ITEMS[$i]}" == "$CHOSEN" ]] && { chosen_idx=$i; break; }
done

if [[ $chosen_idx -lt 0 ]]; then
  echo "No model selected"
  exit 1
fi

PROFILE_IDX="${MODEL_MAP_IDX[$chosen_idx]}"

if [[ "$PROFILE_IDX" -ge 0 ]]; then
  # Configured model — pick GGUF variant
  pi=$PROFILE_IDX
  FILE_COUNT=$(jq ".[$pi].files | length" "$CONFIG_FILE")
  FIRST_FILE=$(jq -r ".[$pi].files[0]" "$CONFIG_FILE")

  if [[ $FILE_COUNT -gt 1 ]]; then
    GGUF_ITEMS=()
    while IFS= read -r f; do
      size="missing"
      [[ -f "${MODELS_DIR}/${f}" ]] && size=$(du -h "${MODELS_DIR}/${f}" 2>/dev/null | cut -f1)
      GGUF_ITEMS+=("${f}  (${size})")
    done < <(jq -r ".[$pi].files[]" "$CONFIG_FILE")
    CHOSEN_GGUF=$(printf '%s\n' "${GGUF_ITEMS[@]}" | gum choose --header "Select GGUF variant")
    MODEL=$(echo "$CHOSEN_GGUF" | sed 's/  (.*//')
  else
    MODEL="$FIRST_FILE"
  fi
else
  MODEL="${MODEL_MAP_FILE[$chosen_idx]}"
fi

MODEL_PATH="${MODELS_DIR}/${MODEL}"

# Convert WSL path to Windows path for .exe
if [[ "$SERVER" == *.exe ]]; then
  WIN_MODEL_PATH=$(wslpath -w "$MODEL_PATH")
else
  WIN_MODEL_PATH="$MODEL_PATH"
fi

# ─── Load defaults ───────────────────────────────────────────────────────────

# Generic defaults
DEF_ALIAS=$(echo "$MODEL" | sed 's/\.gguf$//' | tr '[:upper:]' '[:lower:]' | tr ' _' '-')
DEF_CTX=32768 DEF_NGL=99 DEF_FLASH="on" DEF_CACHE_K="q4_0" DEF_CACHE_V="q4_0"
DEF_THREADS=8 DEF_PORT=8080 DEF_PARALLEL=1 DEF_BATCH=2048 DEF_UBATCH=512
DEF_JINJA="on" DEF_TEMP=0.7 DEF_TOP_P=0.9 DEF_TOP_K=40 DEF_HOST="127.0.0.1"
DEF_CHAT_TEMPLATE_KWARGS=""

# Override with profile defaults if configured
if [[ "$PROFILE_IDX" -ge 0 ]]; then
  pi=$PROFILE_IDX
  DEF_ALIAS=$(jq -r ".[$pi].alias" "$CONFIG_FILE")
  DEF_CTX=$(jq -r ".[$pi].ctx" "$CONFIG_FILE")
  DEF_NGL=$(jq -r ".[$pi].ngl // empty" "$CONFIG_FILE")
  DEF_FLASH=$(jq -r ".[$pi].flash_attn" "$CONFIG_FILE")
  DEF_CACHE_K=$(jq -r ".[$pi].cache_k" "$CONFIG_FILE")
  DEF_CACHE_V=$(jq -r ".[$pi].cache_v" "$CONFIG_FILE")
  DEF_THREADS=$(jq -r ".[$pi].threads" "$CONFIG_FILE")
  DEF_PORT=$(jq -r ".[$pi].port" "$CONFIG_FILE")
  DEF_PARALLEL=$(jq -r ".[$pi].parallel" "$CONFIG_FILE")
  DEF_BATCH=$(jq -r ".[$pi].batch" "$CONFIG_FILE")
  DEF_UBATCH=$(jq -r ".[$pi].ubatch" "$CONFIG_FILE")
  DEF_JINJA=$(jq -r ".[$pi].jinja" "$CONFIG_FILE")
  DEF_TEMP=$(jq -r ".[$pi].temp" "$CONFIG_FILE")
  DEF_TOP_P=$(jq -r ".[$pi].top_p" "$CONFIG_FILE")
  DEF_TOP_K=$(jq -r ".[$pi].top_k" "$CONFIG_FILE")
  DEF_HOST=$(jq -r ".[$pi].host // \"127.0.0.1\"" "$CONFIG_FILE")
  DEF_CHAT_TEMPLATE_KWARGS=$(jq -r ".[$pi].chat_template_kwargs // empty" "$CONFIG_FILE")
fi

# ─── Check model file ────────────────────────────────────────────────────────

DRY_RUN=${DRY_RUN:-false}

# ─── Launch mode ─────────────────────────────────────────────────────────────

MODE=$(echo -e "⚡ Quick launch (recommended defaults)\n🔧 Custom" | gum choose --header "Launch mode")

# Set all params to defaults
ALIAS="$DEF_ALIAS" CTX="$DEF_CTX" NGL="$DEF_NGL" FA="$DEF_FLASH"
CACHE_K="$DEF_CACHE_K" CACHE_V="$DEF_CACHE_V" THREADS="$DEF_THREADS"
HOST="$DEF_HOST" PORT="$DEF_PORT" PARALLEL="$DEF_PARALLEL"
BATCH="$DEF_BATCH" UBATCH="$DEF_UBATCH" JINJA="$DEF_JINJA"
TEMP="$DEF_TEMP" TOP_P="$DEF_TOP_P" TOP_K="$DEF_TOP_K"
CHAT_TEMPLATE_KWARGS="$DEF_CHAT_TEMPLATE_KWARGS"

if [[ "$MODE" == *"Custom"* ]]; then

# ─── Custom parameters ───────────────────────────────────────────────────────

show_status() {
  clear
  local lines="Model: ${MODEL}"
  [[ -n "$ALIAS" ]]   && lines="${lines}\n  Alias: ${ALIAS}"
  [[ -n "$CTX" ]]     && lines="${lines}\n  Context: ${CTX}"
  lines="${lines}\n  GPU layers: ${NGL:-auto}"
  [[ -n "$FA" ]]      && lines="${lines}\n  Flash attn: ${FA}"
  [[ -n "$CACHE_K" ]] && lines="${lines}\n  KV cache: K=${CACHE_K} V=${CACHE_V}"
  [[ -n "$THREADS" ]] && lines="${lines}\n  Threads: ${THREADS}"
  [[ -n "$HOST" ]]    && lines="${lines}\n  Host: ${HOST}"
  [[ -n "$PORT" ]]    && lines="${lines}\n  Port: ${PORT}"
  [[ -n "$PARALLEL" ]] && lines="${lines}\n  Parallel: ${PARALLEL}"
  [[ -n "$BATCH" ]]   && lines="${lines}\n  Batch: ${BATCH}"
  [[ -n "$UBATCH" ]]  && lines="${lines}\n  Ubatch: ${UBATCH}"
  [[ -n "$JINJA" ]]   && lines="${lines}\n  Jinja: ${JINJA}"
  [[ -n "$TEMP" ]]    && lines="${lines}\n  Temp: ${TEMP}"
  [[ -n "$TOP_P" ]]   && lines="${lines}\n  Top-P: ${TOP_P}"
  [[ -n "$TOP_K" ]]   && lines="${lines}\n  Top-K: ${TOP_K}"
  echo -e "$lines" | gum style --foreground 81 --border rounded --padding "0 1" --border-foreground 99
  echo
}

show_status
ALIAS=$(gum input --header "Alias (--alias)" --value "$DEF_ALIAS")

show_status
CTX=$(echo -e "4096\n8192\n16384\n32768\n65536\n131072\n163840\n204800\n262144" | gum choose --header "Context size (-c)" --selected "$DEF_CTX")

show_status
NGL=$(echo -e "auto\n0\n10\n20\n30\n40\n50\n60\n80\n99" | gum choose --header "GPU layers (-ngl)" --selected "${DEF_NGL:-auto}")
[[ "$NGL" == "auto" ]] && NGL=""

show_status
FA=$(echo -e "on\noff" | gum choose --header "Flash attention" --selected "$DEF_FLASH")

show_status
CACHE_K=$(echo -e "f16\nq8_0\nq4_0" | gum choose --header "KV cache type (key)" --selected "$DEF_CACHE_K")

show_status
CACHE_V=$(echo -e "f16\nq8_0\nq4_0" | gum choose --header "KV cache type (value)" --selected "$DEF_CACHE_V")

show_status
THREADS=$(echo -e "4\n6\n8\n10\n12\n16" | gum choose --header "Threads (-t)" --selected "$DEF_THREADS")

show_status
HOST=$(gum input --header "Host (--host)" --value "$DEF_HOST")

show_status
PORT=$(echo -e "8080\n8081\n8082\n9090" | gum choose --header "Port (--port)" --selected "$DEF_PORT")

show_status
PARALLEL=$(echo -e "1\n2\n4\n8" | gum choose --header "Parallel requests (-np)" --selected "$DEF_PARALLEL")

show_status
BATCH=$(echo -e "512\n1024\n2048\n4096\n8192" | gum choose --header "Batch size (-b)" --selected "$DEF_BATCH")

show_status
UBATCH=$(echo -e "128\n256\n512\n1024\n2048" | gum choose --header "Micro-batch size (-ub)" --selected "$DEF_UBATCH")

show_status
JINJA=$(echo -e "on\noff" | gum choose --header "Jinja templates (--jinja)" --selected "$DEF_JINJA")

show_status
TEMP=$(gum input --header "Temperature (--temp)" --value "$DEF_TEMP")

show_status
TOP_P=$(gum input --header "Top-P (--top-p)" --value "$DEF_TOP_P")

show_status
TOP_K=$(gum input --header "Top-K (--top-k)" --value "$DEF_TOP_K")

fi # end custom mode

# ─── Build command ───────────────────────────────────────────────────────────

CMD=("$SERVER"
  -m "$WIN_MODEL_PATH"
  --alias "$ALIAS"
)

[[ -n "$NGL" ]] && CMD+=(-ngl "$NGL")

CMD+=(
  -c "$CTX"
  --cache-type-k "$CACHE_K"
  --cache-type-v "$CACHE_V"
  -t "$THREADS"
  --host "$HOST"
  --port "$PORT"
  -np "$PARALLEL"
  -b "$BATCH"
  -ub "$UBATCH"
  --temp "$TEMP"
  --top-p "$TOP_P"
  --top-k "$TOP_K"
)

[[ "$FA" == "on" ]] && CMD+=(--flash-attn on)
[[ "$JINJA" == "on" ]] && CMD+=(--jinja)
[[ -n "$CHAT_TEMPLATE_KWARGS" ]] && CMD+=(--chat-template-kwargs "$CHAT_TEMPLATE_KWARGS")

# ─── Summary ─────────────────────────────────────────────────────────────────

SUMMARY=$(cat <<EOF
  Model:      ${MODEL}
  Alias:      ${ALIAS}
  Context:    ${CTX}
  GPU layers: ${NGL:-auto}
  Flash attn: ${FA}
  KV cache:   K=${CACHE_K} V=${CACHE_V}
  Threads:    ${THREADS}
  Host:       ${HOST}
  Port:       ${PORT}
  Parallel:   ${PARALLEL}
  Batch:      ${BATCH}
  Ubatch:     ${UBATCH}
  Jinja:      ${JINJA}
  Chat kwargs: ${CHAT_TEMPLATE_KWARGS:-none}
  Temp:       ${TEMP}
  Top-P:      ${TOP_P}
  Top-K:      ${TOP_K}
EOF
)

echo
gum style --bold --foreground 99 --border rounded --padding "0 1" "Launch summary"
gum style --foreground 81 "$SUMMARY"
echo
gum style --faint "${CMD[*]}"
echo

if [[ "$DRY_RUN" == true ]]; then
  gum style --foreground 214 "Dry run — command printed, not executed."
  exit 0
fi

[[ -f "$SERVER" ]] || { echo "llama-server.exe not found: ${SERVER}"; exit 1; }
[[ -f "$MODEL_PATH" ]] || { echo "Model not found: ${MODEL_PATH}"; exit 1; }

gum confirm "Launch?" || { echo "Aborted."; exit 0; }

echo
gum style --bold --foreground 82 "Starting llama-server on ${HOST}:${PORT}..."
echo
exec "${CMD[@]}"
