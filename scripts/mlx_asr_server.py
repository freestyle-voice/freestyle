#!/usr/bin/env python3
"""MLX ASR worker for Freestyle (Apple Silicon).

The Node server keeps this process alive and sends newline-delimited JSON over
stdin. Responses are newline-delimited JSON on stdout; logs go to stderr.

Pass any Hugging Face model id that mlx-audio supports via --model, for example:
  mlx-community/Qwen3-ASR-0.6B-5bit
  mlx-community/parakeet-...  (when published for mlx-audio STT)

Re-publish the frozen worker release when this script or mlx-audio dependencies change.
"""

from __future__ import annotations

import argparse
import json
import sys
import threading
from inspect import Parameter, signature
from pathlib import Path
from typing import Any

import numpy as np

_state: dict[str, Any] = {"model": None, "model_id": None}

# mlx-audio STT models use different keyword names for Freestyle word-boost / context.
# Pick the first alias present on ``generate`` (or ``stream_transcribe``) — never send all.
_CONTEXT_PARAM_ALIASES: tuple[str, ...] = (
    "system_prompt",  # Qwen3-ASR
    "initial_prompt",  # Whisper
    "prompt",  # Qwen2-Audio, Granite Speech
    "context",  # VibeVoice ASR
)
_LANGUAGE_PARAM_ALIASES: tuple[str, ...] = ("language",)


def _log(msg: str) -> None:
    print(f"[mlx-asr] {msg}", file=sys.stderr, flush=True)


def _send(payload: dict[str, Any]) -> None:
    print(json.dumps(payload, ensure_ascii=True), flush=True)


class _DownloadProgress:
    """Holds aggregate download state and emits JSON progress to stdout."""

    def __init__(self) -> None:
        self.bytes_downloaded: int = 0
        self.bytes_total: int = 0

    def emit(self) -> None:
        if self.bytes_total > 0:
            _send({
                "type": "progress",
                "bytesDownloaded": self.bytes_downloaded,
                "bytesTotal": self.bytes_total,
            })


_dl_progress: _DownloadProgress | None = None


class _ProgressTqdm:
    """Minimal tqdm replacement that emits JSON progress lines to stdout.

    ``huggingface_hub.snapshot_download`` uses this class in two roles:

    1. **Aggregate bytes bar** — created once via ``_create_progress_bar``.
       The internal ``_AggregatedTqdm`` helper mutates ``.total`` and calls
       ``.update(n)`` / ``.refresh()`` as each file chunk arrives.
    2. **File-listing bar** — created by ``thread_map`` to show how many
       files have been fetched.  We ignore this bar (``_is_bytes=False``).

    Only the aggregate bytes bar emits progress JSON to the Node caller.
    Thread safety: ``+= total`` and ``update(n)`` are called from up to 8
    download threads.  Minor races on ``self.n``/``self.total`` are
    acceptable for a progress bar.
    """

    _lock = threading.RLock()

    @classmethod
    def get_lock(cls) -> threading.RLock:
        return cls._lock

    @classmethod
    def set_lock(cls, lock: Any) -> None:
        cls._lock = lock

    def __init__(self, iterable: Any = None, *, total: int | None = None, **_kwargs: Any) -> None:
        self._iterable = iterable
        self.total: int = total or 0
        self.n: int = _kwargs.get("initial", 0)
        self._is_bytes = _kwargs.get("unit") == "B"

    def __iter__(self) -> Any:
        if self._iterable is None:
            return
        for item in self._iterable:
            self.update(1)
            yield item

    def __len__(self) -> int:
        return self.total

    def update(self, n: int | float | None = 1) -> None:
        if n:
            self.n += int(n)
        self._emit()

    def _emit(self) -> None:
        if self._is_bytes and _dl_progress is not None and self.total > 0:
            with self._lock:
                _dl_progress.bytes_downloaded = self.n
                _dl_progress.bytes_total = self.total
                _dl_progress.emit()

    def refresh(self) -> None:
        self._emit()

    def set_description(self, *_args: Any, **_kwargs: Any) -> None:
        pass

    def close(self) -> None:
        pass

    def __enter__(self) -> "_ProgressTqdm":
        return self

    def __exit__(self, *_args: Any) -> None:
        self.close()


def _download_model(model_id: str) -> None:
    global _dl_progress
    from huggingface_hub import snapshot_download

    _dl_progress = _DownloadProgress()
    _log(f"downloading {model_id} ...")
    path = snapshot_download(model_id, tqdm_class=_ProgressTqdm)
    _dl_progress = None
    _send({"type": "downloaded", "model": model_id, "path": path})


def _model_status(model_id: str) -> None:
    from huggingface_hub import snapshot_download

    try:
        path = snapshot_download(model_id, local_files_only=True)
        _send({"downloaded": True, "model": model_id, "path": path})
    except Exception:
        _send({"downloaded": False, "model": model_id})


def _load_model(model_id: str) -> None:
    if _state["model_id"] == model_id and _state["model"] is not None:
        return

    from mlx_audio.stt import load

    _log(f"loading {model_id} ...")
    _state["model"] = load(model_id)
    _state["model_id"] = model_id
    _log("model ready")


def _function_params(fn: Any) -> dict[str, Parameter]:
    try:
        return signature(fn).parameters
    except (TypeError, ValueError):
        return {}


def _pick_supported_param(
    fn: Any,
    aliases: tuple[str, ...],
    value: str | None,
) -> dict[str, Any]:
    if not value:
        return {}
    params = _function_params(fn)
    if not params:
        return {aliases[0]: value}
    for name in aliases:
        if name in params:
            return {name: value}
    _log(f"dropping {aliases[0]!r}: not supported by {_state['model_id']}")
    return {}


def _supported_kwargs(fn: Any, kwargs: dict[str, Any]) -> dict[str, Any]:
    params = _function_params(fn)
    if not params:
        return kwargs
    return {key: value for key, value in kwargs.items() if key in params}


def _strip_prompt_kwargs(kwargs: dict[str, Any]) -> dict[str, Any]:
    drop = set(_CONTEXT_PARAM_ALIASES)
    return {key: value for key, value in kwargs.items() if key not in drop}


def _text_from_result(result: Any) -> str:
    if result is None:
        return ""
    if isinstance(result, str):
        return result
    if isinstance(result, list):
        for item in result:
            text = _text_from_result(item)
            if text:
                return text
        return ""
    if isinstance(result, dict):
        for key in ("text", "transcription", "result"):
            if key in result:
                return _text_from_result(result[key])
        return ""
    text = getattr(result, "text", None)
    if text is not None:
        return _text_from_result(text)
    return str(result)


def _transcribe_kwargs(
    fn: Any,
    *,
    language: str | None,
    context: str | None,
) -> dict[str, Any]:
    lang = language.strip() if language and language.strip() else None
    prompt = context.strip() if context and context.strip() else None

    kwargs: dict[str, Any] = {}
    kwargs.update(_pick_supported_param(fn, _LANGUAGE_PARAM_ALIASES, lang))
    kwargs.update(_pick_supported_param(fn, _CONTEXT_PARAM_ALIASES, prompt))
    return kwargs


def _pcm_path_to_wav_path(pcm_path: Path, sample_rate: int) -> str:
    """Convert raw PCM to a 16 kHz mono WAV path.

    Some mlx-audio models (e.g. Parakeet) accept file paths but fail on float32
    ndarrays passed to ``generate()``. Writing a sidecar WAV keeps streaming and
    batch inference on the same code path.
    """
    import wave

    pcm = np.fromfile(pcm_path, dtype=np.int16)
    out_rate = sample_rate
    if sample_rate != 16000:
        from mlx_audio.stt.utils import resample_audio

        f32 = pcm.astype(np.float32) / 32768.0
        f32 = resample_audio(f32, sample_rate, 16000)
        pcm = np.clip(f32 * 32768.0, -32768, 32767).astype(np.int16)
        out_rate = 16000

    wav_path = pcm_path.with_suffix(f"{pcm_path.suffix}.wav")
    with wave.open(str(wav_path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(out_rate)
        wf.writeframes(pcm.tobytes())
    return str(wav_path)


def _audio_from_message(message: dict[str, Any]) -> str:
    audio_path = message.get("audio_path")
    if not isinstance(audio_path, str) or not audio_path:
        raise ValueError("missing audio_path")
    path = Path(audio_path)
    if not path.is_file():
        raise FileNotFoundError(audio_path)

    if message.get("audio_format") != "pcm_s16le":
        return audio_path

    sample_rate = int(message.get("sample_rate") or 16000)
    return _pcm_path_to_wav_path(path, sample_rate)


def _transcribe(
    audio: str,
    *,
    language: str | None,
    context: str | None,
) -> str:
    model = _state["model"]
    if model is None:
        raise RuntimeError("model not loaded")

    kwargs = _transcribe_kwargs(
        model.generate,
        language=language,
        context=context,
    )
    try:
        result = model.generate(audio, **kwargs)
    except TypeError:
        trimmed = _strip_prompt_kwargs(kwargs)
        if trimmed == kwargs:
            raise
        result = model.generate(audio, **trimmed)

    return _text_from_result(result).strip()


def _stream_transcribe(
    audio: str,
    *,
    language: str | None,
    context: str | None,
    live: bool,
    on_partial: Any,
) -> str:
    model = _state["model"]
    if model is None:
        raise RuntimeError("model not loaded")
    if not hasattr(model, "stream_transcribe"):
        return _transcribe(audio, language=language, context=context)

    kwargs = _transcribe_kwargs(
        model.stream_transcribe,
        language=language,
        context=context,
    )
    kwargs = {
        **kwargs,
        **_supported_kwargs(
            model.stream_transcribe,
            {"min_chunk_duration": 0.5 if live else 1.0},
        ),
    }

    try:
        iterator = model.stream_transcribe(audio=audio, **kwargs)
    except TypeError:
        iterator = model.stream_transcribe(audio, **kwargs)

    pieces: list[str] = []
    last_text = ""
    for result in iterator:
        piece = _text_from_result(result)
        if not piece:
            continue
        pieces.append(piece)
        text = "".join(pieces).strip()
        if text and text != last_text:
            last_text = text
            on_partial(text)

    return "".join(pieces).strip()


def _handle_transcribe(message: dict[str, Any]) -> None:
    req_id = message.get("id")

    try:
        audio = _audio_from_message(message)
        if message.get("stream") or message.get("audio_format") == "pcm_s16le":
            emit_partials = bool(message.get("stream"))
            def partial_handler(text: str) -> None:
                if emit_partials:
                    _send({"id": req_id, "type": "partial", "text": text})

            text = _stream_transcribe(
                audio,
                language=message.get("language"),
                context=message.get("context"),
                live=bool(message.get("live")),
                on_partial=partial_handler,
            )
        else:
            text = _transcribe(
                audio,
                language=message.get("language"),
                context=message.get("context"),
            )
        _send({"id": req_id, "type": "final", "text": text})
    except Exception as exc:
        _log(f"inference error: {exc}")
        _send({"id": req_id, "error": str(exc)})


def _serve() -> None:
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            message = json.loads(line)
        except json.JSONDecodeError as exc:
            _send({"error": f"invalid json: {exc}"})
            continue

        msg_type = message.get("type")
        if msg_type == "shutdown":
            _log("shutting down")
            return
        if msg_type == "transcribe":
            _handle_transcribe(message)
            continue
        _send({"id": message.get("id"), "error": f"unknown message type: {msg_type}"})


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--model",
        default="mlx-community/Qwen3-ASR-0.6B-5bit",
        help="Hugging Face model id for mlx_audio.stt.load()",
    )
    parser.add_argument("--host", default=None)
    parser.add_argument("--port", type=int, default=None)
    parser.add_argument("--preload", action="store_true")
    parser.add_argument("--download-model", action="store_true")
    parser.add_argument("--model-status", action="store_true")
    args = parser.parse_args()

    if args.model_status:
        _model_status(args.model)
        return

    if args.download_model:
        _download_model(args.model)
        return

    try:
        import mlx_audio  # noqa: F401
    except ImportError:
        _log("mlx_audio is not installed - run: pip install mlx-audio")
        sys.exit(1)

    _load_model(args.model)
    _send({"type": "ready", "model": args.model})
    _serve()


if __name__ == "__main__":
    main()
