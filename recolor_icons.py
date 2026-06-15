#!/usr/bin/env python3
"""Recolor green Freestyle icon assets to royal blue."""

import colorsys
import os
from pathlib import Path
from PIL import Image

# Dominant green in the original build/icons PNGs
SRC_GREEN = (107, 143, 18)
# Dominant blue in the already-recolored build/icon.png
TGT_BLUE = (67, 85, 149)

sr, sg, sb = [c / 255 for c in SRC_GREEN]
tr, tg, tb = [c / 255 for c in TGT_BLUE]
sh, ss, sv = colorsys.rgb_to_hsv(sr, sg, sb)
th, ts, tv = colorsys.rgb_to_hsv(tr, tg, tb)

HUE_SHIFT = th - sh  # radians / fraction of 1.0
SAT_SCALE = ts / ss if ss > 0 else 1.0
VAL_SCALE = tv / sv if sv > 0 else 1.0


def is_greenish(r: int, g: int, b: int, a: int) -> bool:
    """Green-ish colored pixels (not white/transparent)."""
    if a < 128:
        return False
    # White/near-white should stay white
    if r > 200 and g > 200 and b > 200:
        return False
    # Green family: green channel dominates
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


def main():
    base = Path("apps/electron/build/icons")
    for src in sorted(base.glob("*.png")):
        print(f"Recoloring {src}")
        recolor_image(src, src)

    # Also regenerate the multi-size ICO from the recolored PNGs
    sizes = [16, 24, 32, 48, 64, 96, 128, 256, 512]
    icon_pngs = [Path(f"apps/electron/build/icons/{s}x{s}.png") for s in sizes]
    images = [Image.open(p).convert("RGBA") for p in icon_pngs if p.exists()]
    if images:
        ico_path = Path("apps/electron/build/icon.ico")
        print(f"Writing {ico_path}")
        images[0].save(ico_path, format="ICO", sizes=[(i.width, i.height) for i in images], append_images=images[1:])


if __name__ == "__main__":
    main()
