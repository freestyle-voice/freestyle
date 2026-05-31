#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_DIR="${ROOT_DIR}/.venv-mlx-asr"
OUT_DIR="${ROOT_DIR}/apps/electron/resources/mlx-asr"

PYTHON_BIN="${PYTHON_BIN:-python3.12}"

if ! command -v "${PYTHON_BIN}" >/dev/null 2>&1; then
  echo "Python 3.12 is required to build the MLX ASR worker." >&2
  echo "Install it or set PYTHON_BIN=/path/to/python3.12." >&2
  exit 1
fi

"${PYTHON_BIN}" -m venv "${VENV_DIR}"
"${VENV_DIR}/bin/python" -m pip install -U pip
"${VENV_DIR}/bin/python" -m pip install -U pyinstaller mlx-audio "huggingface_hub[hf_xet]"

rm -rf "${ROOT_DIR}/build/mlx_asr_worker" "${ROOT_DIR}/dist/mlx_asr_worker"
"${VENV_DIR}/bin/pyinstaller" \
  --clean \
  --onedir \
  --name mlx_asr_worker \
  --collect-all mlx \
  --collect-all mlx_audio \
  --collect-all huggingface_hub \
  --distpath "${ROOT_DIR}/dist" \
  --workpath "${ROOT_DIR}/build/mlx_asr_worker" \
  "${ROOT_DIR}/scripts/mlx_asr_server.py"

rm -rf "${OUT_DIR}/mlx_asr_worker"
mkdir -p "${OUT_DIR}"
cp -R "${ROOT_DIR}/dist/mlx_asr_worker" "${OUT_DIR}/mlx_asr_worker"

echo "MLX ASR worker written to ${OUT_DIR}/mlx_asr_worker"
