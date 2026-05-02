#!/usr/bin/env bash
set -Eeuo pipefail

# llama-update.sh — Download latest llama.cpp release (CUDA 13.1) for Windows
#
# Usage:
#   ./llama-update.sh                        # download latest
#   ./llama-update.sh --dir /mnt/c/Users/Ivan/llama-bin
#   ./llama-update.sh --build b8849          # pin specific build
#   ./llama-update.sh --dry-run

INSTALL_DIR="${INSTALL_DIR:-/mnt/c/Users/Ivan/llama-bin}"
CUDA_VER="13.1"
TARGETS="llama-server llama-bench llama-cli llama-mtmd-cli"

PINNED_BUILD=""
DRY_RUN=false

# ─── Colors ──────────────────────────────────────────────────────────────────

R=$'\033[0;31m' G=$'\033[0;32m' Y=$'\033[1;33m' C=$'\033[0;36m'
B=$'\033[1m' N=$'\033[0m'

log()  { echo -e "${C}[$(date +%H:%M:%S)]${N} $*"; }
ok()   { echo -e "${G}[✓]${N} $*"; }
warn() { echo -e "${Y}[!]${N} $*"; }
err()  { echo -e "${R}[✗]${N} $*"; exit 1; }

# ─── Parse args ──────────────────────────────────────────────────────────────

while [[ $# -gt 0 ]]; do
  case $1 in
    --dir)      INSTALL_DIR="$2"; shift 2 ;;
    --build)    PINNED_BUILD="$2"; shift 2 ;;
    --dry-run)  DRY_RUN=true; shift ;;
    --help|-h)
      echo "Usage: $0 [--dir PATH] [--build bNNNN] [--dry-run]"
      exit 0 ;;
    *) err "Unknown argument: $1" ;;
  esac
done

echo
echo -e "${B}╔════════════════════════════════════════════════╗${N}"
echo -e "${B}║        llama.cpp Updater (CUDA ${CUDA_VER})          ║${N}"
echo -e "${B}╚════════════════════════════════════════════════╝${N}"
echo

# ─── Check dependencies ──────────────────────────────────────────────────────

for dep in curl jq unzip; do
  if ! command -v "$dep" &>/dev/null; then
    err "$dep not found — install it (e.g. sudo apt install $dep)"
  fi
done
ok "Dependencies: curl, jq, unzip — all present"

# ─── Fetch latest release info ───────────────────────────────────────────────

API_URL="https://api.github.com/repos/ggml-org/llama.cpp/releases"

if [[ -n "$PINNED_BUILD" ]]; then
  log "Fetching release info for ${PINNED_BUILD}..."
  RELEASE_JSON=$(curl -fsSL "${API_URL}/tags/${PINNED_BUILD}")
else
  log "Fetching latest release info..."
  RELEASE_JSON=$(curl -fsSL "${API_URL}/latest")
fi

BUILD_TAG=$(echo "$RELEASE_JSON" | jq -r '.tag_name')
log "Latest build: ${BUILD_TAG}"

# ─── Check if already up to date ─────────────────────────────────────────────

VERSION_FILE="${INSTALL_DIR}/.build"
if [[ -f "$VERSION_FILE" ]]; then
  INSTALLED=$(cat "$VERSION_FILE")
  if [[ "$INSTALLED" == "$BUILD_TAG" ]]; then
    ok "Already up to date: ${BUILD_TAG}"
    echo
    exit 0
  fi
  warn "Installed: ${INSTALLED} → updating to ${BUILD_TAG}"
fi

# ─── Resolve download URLs ────────────────────────────────────────────────────

BIN_ZIP=$(echo "$RELEASE_JSON" | jq -r \
  ".assets[] | select(.name | test(\"bin-win-cuda-${CUDA_VER}-x64\")) | .browser_download_url" \
  | grep -v cudart | head -1)

DLL_ZIP=$(echo "$RELEASE_JSON" | jq -r \
  ".assets[] | select(.name | test(\"cudart-llama-bin-win-cuda-${CUDA_VER}-x64\")) | .browser_download_url" \
  | head -1)

[[ -z "$BIN_ZIP" ]] && err "Could not find CUDA ${CUDA_VER} binary zip in release ${BUILD_TAG}"
[[ -z "$DLL_ZIP" ]] && err "Could not find CUDA ${CUDA_VER} DLL zip in release ${BUILD_TAG}"

ok "Binaries:  $(basename "$BIN_ZIP")"
ok "CUDA DLLs: $(basename "$DLL_ZIP")"
echo

# ─── Download ─────────────────────────────────────────────────────────────────

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

BIN_FILE="${TMPDIR}/llama-bin.zip"
DLL_FILE="${TMPDIR}/llama-dll.zip"

if $DRY_RUN; then
  warn "(dry-run) Would download:"
  warn "  $BIN_ZIP"
  warn "  $DLL_ZIP"
  warn "(dry-run) Would install to: ${INSTALL_DIR}"
  exit 0
fi

log "Downloading binaries..."
curl -fL --progress-bar "$BIN_ZIP" -o "$BIN_FILE"

log "Downloading CUDA DLLs..."
curl -fL --progress-bar "$DLL_ZIP" -o "$DLL_FILE"

# ─── Install ──────────────────────────────────────────────────────────────────

log "Installing to ${INSTALL_DIR}..."
mkdir -p "$INSTALL_DIR"

unzip -o -q "$BIN_FILE" -d "$INSTALL_DIR"
unzip -o -q "$DLL_FILE" -d "$INSTALL_DIR"

echo "$BUILD_TAG" > "$VERSION_FILE"

# ─── Verify ───────────────────────────────────────────────────────────────────

echo
log "Checking binaries..."
echo

ALL_OK=true
for t in $TARGETS; do
  BIN="${INSTALL_DIR}/${t}.exe"
  if [[ -f "$BIN" ]]; then
    SIZE=$(du -h "$BIN" | cut -f1)
    ok "  ${t}.exe  (${SIZE})"
  else
    warn "  ${t}.exe — not found (may not be in this release)"
    ALL_OK=false
  fi
done

echo
echo -e "${B}╔════════════════════════════════════════════════╗${N}"
if $ALL_OK; then
  echo -e "${B}║${N}  ${G}Update complete${N}"
else
  echo -e "${B}║${N}  ${Y}Done (some binaries missing)${N}"
fi
echo -e "${B}╠════════════════════════════════════════════════╣${N}"
echo -e "${B}║${N}  Build:    ${C}${BUILD_TAG}${N}"
echo -e "${B}║${N}  CUDA:     ${C}${CUDA_VER}${N}"
echo -e "${B}║${N}  Install:  ${C}${INSTALL_DIR}${N}"
echo -e "${B}╚════════════════════════════════════════════════╝${N}"
echo
