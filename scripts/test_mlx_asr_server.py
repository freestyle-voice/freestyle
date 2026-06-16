#!/usr/bin/env python3
"""Unit tests for mlx_asr_server helpers (no Metal / model weights required)."""

from __future__ import annotations

import importlib.util
import sys
import tempfile
import unittest
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

spec = importlib.util.spec_from_file_location(
    "mlx_asr_server",
    ROOT / "scripts" / "mlx_asr_server.py",
)
mlx_asr_server = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(mlx_asr_server)


class TranscribeKwargsTests(unittest.TestCase):
    def test_named_params_only(self) -> None:
        def generate(
            audio: str,
            *,
            language: str | None = None,
            system_prompt: str | None = None,
            **kwargs: object,
        ) -> object:
            return None

        out = mlx_asr_server._transcribe_kwargs(
            generate,
            language="en",
            context="Acme Corp",
        )
        self.assertEqual(
            out,
            {"language": "en", "system_prompt": "Acme Corp"},
        )

    def test_ignores_prompt_when_not_in_signature(self) -> None:
        def generate(audio: str, *, dtype: object = None, **kwargs: object) -> object:
            return None

        out = mlx_asr_server._transcribe_kwargs(
            generate,
            language="en",
            context="Acme Corp",
        )
        self.assertEqual(out, {})

    def test_whisper_initial_prompt(self) -> None:
        def generate(
            audio: str,
            *,
            language: str | None = None,
            initial_prompt: str | None = None,
        ) -> object:
            return None

        out = mlx_asr_server._transcribe_kwargs(
            generate,
            language="en",
            context="Acme Corp",
        )
        self.assertEqual(
            out,
            {"language": "en", "initial_prompt": "Acme Corp"},
        )

    def test_prefers_system_prompt_over_prompt(self) -> None:
        def generate(
            audio: str,
            *,
            system_prompt: str | None = None,
            prompt: str | None = None,
        ) -> object:
            return None

        out = mlx_asr_server._transcribe_kwargs(
            generate,
            language=None,
            context="only one",
        )
        self.assertEqual(out, {"system_prompt": "only one"})

    def test_empty_context_omitted(self) -> None:
        def generate(audio: str, *, system_prompt: str | None = None) -> object:
            return None

        self.assertEqual(
            mlx_asr_server._transcribe_kwargs(generate, language=None, context="  "),
            {},
        )


class PcmToWavTests(unittest.TestCase):
    def test_writes_16k_mono_wav(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            pcm_path = Path(tmp) / "chunk.pcm"
            pcm_path.write_bytes(b"\x00\x00" * 1600)
            wav_path = mlx_asr_server._pcm_path_to_wav_path(pcm_path, 16000)
            self.assertTrue(Path(wav_path).is_file())
            with wave.open(wav_path, "rb") as wf:
                self.assertEqual(wf.getnchannels(), 1)
                self.assertEqual(wf.getsampwidth(), 2)
                self.assertEqual(wf.getframerate(), 16000)
                self.assertEqual(wf.getnframes(), 1600)


class TextFromResultTests(unittest.TestCase):
    def test_extracts_text_from_dict_result(self) -> None:
        self.assertEqual(
            mlx_asr_server._text_from_result({"text": "hello"}),
            "hello",
        )

    def test_extracts_text_from_list_result(self) -> None:
        self.assertEqual(
            mlx_asr_server._text_from_result([{"text": "hello"}]),
            "hello",
        )


if __name__ == "__main__":
    unittest.main()
