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


def _download_model(model_id: str) -> None:
    from huggingface_hub import snapshot_download

    _log(f"downloading {model_id} ...")
    path = snapshot_download(model_id)
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
    text = getattr(result, "text", result)
    return "" if text is None else str(text)


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
