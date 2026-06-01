#!/usr/bin/env bash
# Ad-hoc sign a local macOS Freestyle build so the MLX PyInstaller worker can run.
# Usage: ./scripts/sign_mac_app.sh [path/to/Freestyle.app]
#
# WARNING: `codesign --deep` on the whole .app can break Electron Framework Team ID
# matching and prevent the app from launching. This script intentionally signs
# only the MLX worker and clears quarantine attributes for local testing.
# After signing, re-grant Accessibility for Freestyle and macos-key-listener in
# System Settings.
set -euo pipefail

APP="${1:-}"

if [[ -z "${APP}" ]]; then
  ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  APP="${ROOT_DIR}/apps/electron/dist/mac-arm64/Freestyle.app"
fi

if [[ ! -d "${APP}" ]]; then
  echo "Freestyle.app not found: ${APP}" >&2
  exit 1
fi

MLX_WORKER="${APP}/Contents/Resources/mlx-asr/mlx_asr_worker"

if [[ -d "${MLX_WORKER}" ]]; then
  echo "Signing MLX ASR worker bundle..."
  codesign --deep --force --sign - "${MLX_WORKER}"
else
  echo "MLX ASR worker bundle not found; skipping worker signing."
fi

echo "Clearing quarantine attributes..."
xattr -cr "${APP}"

echo "Done. Open ${APP} and test Qwen (API port is usually 4649)."
