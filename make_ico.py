#!/usr/bin/env python3
"""Build a multi-size Windows ICO from PNG files."""

import struct
from pathlib import Path
from PIL import Image


def build_ico(png_paths: list[Path], out_path: Path):
    """Create a multi-size ICO file from PNG images."""
    entries = []
    image_data = []
    offset = 6 + 16 * len(png_paths)  # header + directory

    for path in png_paths:
        img = Image.open(path).convert("RGBA")
        w, h = img.size
        # ICO only supports up to 256 in directory; store 0 for 256
        dir_w = w if w < 256 else 0
        dir_h = h if h < 256 else 0
        data = path.read_bytes()
        entries.append((dir_w, dir_h, len(data), offset))
        image_data.append(data)
        offset += len(data)

    with open(out_path, "wb") as f:
        # ICO header
        f.write(struct.pack("<HHH", 0, 1, len(png_paths)))
        # Directory
        for w, h, size, off in entries:
            # Width, height, colors, reserved, planes, bpp, size, offset
            f.write(struct.pack("<BBBBHHII", w, h, 0, 0, 1, 32, size, off))
        # Image data
        for data in image_data:
            f.write(data)


if __name__ == "__main__":
    sizes = [16, 24, 32, 48, 64, 96, 128, 256, 512]
    png_paths = [Path(f"apps/electron/build/icons/{s}x{s}.png") for s in sizes]
    build_ico(png_paths, Path("apps/electron/build/icon.ico"))
    print("Wrote apps/electron/build/icon.ico")
