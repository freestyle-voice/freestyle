# Packaging Local MLX ASR

Do not rely on macOS system Python for the DMG. Modern macOS does not provide a
guaranteed Python runtime for apps, and `/usr/bin/python3` may be only a
developer-tools stub.

The shippable path is:

1. Build a standalone `mlx_asr_worker` executable on Apple Silicon.
2. Bundle it under Electron resources at
   `apps/electron/resources/mlx-asr/mlx_asr_worker`.
3. Keep `scripts/mlx_asr_server.py` as the development fallback.
4. Let the app download Qwen3 ASR weights into the normal Hugging Face cache.

The app now resolves the worker in this order:

- `FREESTYLE_MLX_ASR_WORKER`
- `process.resourcesPath/mlx-asr/mlx_asr_worker/mlx_asr_worker`
- `process.resourcesPath/mlx-asr/mlx_asr_worker`
- local development `dist/mlx-asr/mlx_asr_worker` candidates
- fallback Python script via `FREESTYLE_PYTHON` or a Python that already has
  `mlx-audio`

PyInstaller can freeze the worker with the CPython interpreter and imported
packages, so the end user does not need to install Python or `mlx-audio`.

The mac packaging script builds the worker before creating the DMG:

```bash
pnpm --filter @freestyle/electron build:mac
```

The underlying worker build command is:

```bash
./scripts/build_mlx_asr_worker.sh
```

It writes:

```text
apps/electron/resources/mlx-asr/mlx_asr_worker/
```

`electron-builder.yml` packages that folder into
`process.resourcesPath/mlx-asr/mlx_asr_worker`, which is the first packaged-app
runtime path Freestyle checks. Users only need to press Download on a Qwen3 row;
the model weights go into Hugging Face's cache and no Python install is needed.

The model weights are still an unavoidable size question. Qwen3 ASR is a real
local model, so the app must either ship selected weights inside the DMG or
download them on first use. This PR keeps the DMG smaller and downloads weights
from the Models screen.
