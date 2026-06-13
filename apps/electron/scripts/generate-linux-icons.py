#!/usr/bin/env python3
"""Generate hicolor-compatible Linux icon sizes from build/icon.png."""

from __future__ import annotations

from pathlib import Path

from PIL import Image

SIZES = (16, 24, 32, 48, 64, 96, 128, 256, 512)


def main() -> None:
    electron_dir = Path(__file__).resolve().parent.parent
    src = electron_dir / "build" / "icon.png"
    out = electron_dir / "build" / "icons"
    out.mkdir(parents=True, exist_ok=True)

    img = Image.open(src).convert("RGBA")
    for size in SIZES:
        resized = img.resize((size, size), Image.Resampling.LANCZOS)
        resized.save(out / f"{size}x{size}.png")


if __name__ == "__main__":
    main()
