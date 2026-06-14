#!/usr/bin/env python3
"""Recolor all Freestyle app icon assets from green to royal blue."""

import colorsys
import subprocess
import sys
from pathlib import Path

from PIL import Image

# Dominant green in the original icon assets.
SRC_GREEN = (107, 143, 18)
# Target royal blue.
TGT_BLUE = (67, 85, 149)

sr, sg, sb = [c / 255 for c in SRC_GREEN]
tr, tg, tb = [c / 255 for c in TGT_BLUE]
sh, ss, sv = colorsys.rgb_to_hsv(sr, sg, sb)
th, ts, tv = colorsys.rgb_to_hsv(tr, tg, tb)

HUE_SHIFT = th - sh
SAT_SCALE = ts / ss if ss > 0 else 1.0
VAL_SCALE = tv / sv if sv > 0 else 1.0


def is_greenish(r: int, g: int, b: int, a: int) -> bool:
    """Green-ish colored pixels (not white/transparent)."""
    if a < 128:
        return False
    if r > 200 and g > 200 and b > 200:
        return False
    return g > r + 15 and g > b + 15


def recolor_pixel(r: int, g: int, b: int, a: int):
    if not is_greenish(r, g, b, a):
        return (r, g, b, a)
    rf, gf, bf = r / 255, g / 255, b / 255
    h, s, v = colorsys.rgb_to_hsv(rf, gf, bf)
    h = (h + HUE_SHIFT) % 1.0
    s = min(1.0, s * SAT_SCALE)
    v = min(1.0, v * VAL_SCALE)
    nr, ng, nb = colorsys.hsv_to_rgb(h, s, v)
    return (int(nr * 255), int(ng * 255), int(nb * 255), a)


def recolor_image(src: Path, dst: Path):
    img = Image.open(src).convert("RGBA")
    pixels = list(img.getdata())
    new_pixels = [recolor_pixel(*p) for p in pixels]
    img.putdata(new_pixels)
    img.save(dst)
    print(f"Recolored {src} -> {dst}")


def generate_ico(src: Path, dst: Path):
    # Windows ICO only supports up to 256x256; larger frames are dropped by PIL.
    sizes = [16, 24, 32, 48, 64, 96, 128, 256]
    images = []
    for size in sizes:
        img = Image.open(src).convert("RGBA").resize((size, size), Image.Resampling.LANCZOS)
        images.append(img)
    # Largest frame first so PIL preserves all resolutions.
    images[-1].save(
        dst,
        format="ICO",
        sizes=[(i.width, i.height) for i in images],
        append_images=images[:-1],
    )
    print(f"Generated {dst}")


def generate_icns(src: Path, dst: Path):
    sizes = [16, 32, 64, 128, 256, 512, 1024]
    images = []
    for size in sizes:
        img = Image.open(src).convert("RGBA").resize((size, size), Image.Resampling.LANCZOS)
        images.append(img)
    images[0].save(dst, format="ICNS", append_images=images[1:])
    print(f"Generated {dst}")


def generate_linux_icons(src: Path, dst_dir: Path):
    sizes = (16, 24, 32, 48, 64, 96, 128, 256, 512)
    img = Image.open(src).convert("RGBA")
    dst_dir.mkdir(parents=True, exist_ok=True)
    for size in sizes:
        resized = img.resize((size, size), Image.Resampling.LANCZOS)
        out = dst_dir / f"{size}x{size}.png"
        resized.save(out)
    print(f"Generated Linux icons in {dst_dir}")


def main():
    electron_dir = Path("apps/electron")
    build_dir = electron_dir / "build"
    resources_dir = electron_dir / "resources"

    src_icon = build_dir / "icon.png"
    if not src_icon.exists():
        print(f"Source icon not found: {src_icon}")
        sys.exit(1)

    # 1. Recolor the master source PNG.
    recolor_image(src_icon, src_icon)

    # 2. Generate Linux hicolor icons from the master source.
    generate_linux_icons(src_icon, build_dir / "icons")

    # 3. Generate Windows ICO from the master source.
    generate_ico(src_icon, build_dir / "icon.ico")

    # 4. Generate macOS ICNS from the master source.
    generate_icns(src_icon, build_dir / "icon.icns")

    # 5. Keep resources/icon.png in sync with build/icon.png.
    recolor_image(src_icon, resources_dir / "icon.png")

    print("All icon assets recolored.")


if __name__ == "__main__":
    main()
