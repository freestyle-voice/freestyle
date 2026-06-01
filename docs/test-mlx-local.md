# Testing MLX Locally

MLX ASR only runs on **Apple Silicon macOS**.

Most development uses `pnpm dev`. You do not need to build a DMG unless you are validating the packaged app or the on-demand worker download.

## Quick start (`pnpm dev`)

One-time Python setup:

```bash
python3 -m pip install mlx-audio "huggingface_hub[hf_xet]"
```

Or use a venv and point Freestyle at it:

```bash
python3.12 -m venv .venv-mlx-asr-dev
source .venv-mlx-asr-dev/bin/activate
pip install mlx-audio "huggingface_hub[hf_xet]"
export FREESTYLE_PYTHON="$PWD/.venv-mlx-asr-dev/bin/python"
```

Run the app:

```bash
pnpm install
pnpm dev
```

In Freestyle:

1. Open **Settings → Models → Change voice**.
2. Pick a **Local MLX** row → **Download** (HF weights only; uses `scripts/mlx_asr_server.py` via your Python).
3. **Use** → dictate once and confirm partials + final text.

Optional status check (port is in Electron logs):

```bash
curl "http://127.0.0.1:<PORT>/api/mlx-asr/status?refresh=1"
```

Expect `canRun: true` and `mlxAudioInstalled: true` when the Python path is working.

## Test on-demand worker download (like production)

Use this when you want to verify the **frozen worker tarball** path (what users get without `mlx-audio` installed), still from `pnpm dev`:

```bash
rm -rf ~/.cache/freestyle/mlx-asr/runtime
pnpm --filter @freestyle/electron build:mlx-asr-worker
python3 -m http.server 8765 -d dist
```

In a second terminal:

```bash
FREESTYLE_MLX_ASR_WORKER_URL=http://127.0.0.1:8765/mlx_asr_worker-darwin-arm64.tar.gz \
  pnpm dev
```

Then **Download** a Qwen model in Settings. You should see the MLX **runtime** download first, then model weights.

To test against the real GitHub asset instead of a local server, omit `FREESTYLE_MLX_ASR_WORKER_URL` (requires `mlx-asr-worker-v1` published on the org repo).

## Optional: packaged Mac build

Only when you need to validate signing, notarization, or a DMG install:

```bash
rm -rf ~/.cache/freestyle/mlx-asr/runtime
CSC_IDENTITY_AUTO_DISCOVERY=false pnpm --filter @freestyle/electron build:mac
./scripts/sign_mac_app.sh apps/electron/dist/mac-arm64/Freestyle.app
FREESTYLE_MLX_ASR_WORKER_URL=http://127.0.0.1:8765/mlx_asr_worker-darwin-arm64.tar.gz \
  "apps/electron/dist/mac-arm64/Freestyle.app/Contents/MacOS/Freestyle"
```

If macOS blocks launch:

```bash
xattr -cr apps/electron/dist/mac-arm64/Freestyle.app
```
