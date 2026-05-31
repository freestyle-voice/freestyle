# Local MLX ASR (Qwen3)

Freestyle can use **on-device Qwen3-ASR** via [mlx-audio](https://github.com/Blaizzy/mlx-audio) on Apple Silicon.

## Requirements

- macOS with Apple Silicon (M1+)
- Packaged app: bundled `mlx_asr_worker`
- Development fallback: Python 3.12+ with `pip install mlx-audio`

Optional: set `FREESTYLE_PYTHON` to your venv’s `python` if it is not on `PATH`.
Optional: set `FREESTYLE_MLX_ASR_WORKER` to a frozen worker executable.

## Setup

Packaged app:

- Open **Settings -> Models -> Voice**
- Press **Download** on a Qwen3 ASR row
- Press **Use** after the download finishes

Development fallback:

```bash
python3 -m pip install mlx-audio "huggingface_hub[hf_xet]"
```

Model weights download from Hugging Face into the normal HF cache.

## Vocabulary / keywords

Dictionary and vocabulary terms from **Settings → Vocabulary** are passed as Qwen3 **context** (`Technical terms: …`) when using `local-mlx`, same idea as the `modeltest` harness.

## Architecture

- Node server spawns `scripts/mlx_asr_server.py` as a local stdio worker
- Packaged builds should spawn a frozen `mlx_asr_worker` executable instead,
  so users do not need a system Python or a `pip install`
- Model stays loaded in the worker process for low latency, unless the
  keep-alive setting is `0`
- Audio is written to a temporary WAV/PCM file and sent to the worker by path
- `POST /api/transcribe` uses the configured default voice model
- Settings -> Models -> Local MLX memory controls how long the worker stays
  loaded after each request. `0` means cold start every request; `10` keeps the
  model warm for ten idle minutes.

## Development

```bash
# Status
curl http://127.0.0.1:PORT/api/mlx-asr/status

# Start worker manually
python3 scripts/mlx_asr_server.py --model mlx-community/Qwen3-ASR-0.6B-5bit
```
