"""Rendered frames to the site's sequence: over the page background, as WebP. python pack_seq.py <scene> [quality]"""
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
scene = sys.argv[1]
quality = int(sys.argv[2]) if len(sys.argv) > 2 else 74
src = ROOT / "tools/blender/out" / scene
dst = ROOT / "public/hero3d/seq" / scene
dst.mkdir(parents=True, exist_ok=True)

total = 0
for i, f in enumerate(sorted(src.glob("f-*.png"))):
    im = Image.open(f).convert("RGBA")
    bg = Image.new("RGBA", im.size, (246, 246, 244, 255))
    bg.alpha_composite(im)
    out = dst / f"{i:03d}.webp"
    bg.convert("RGB").save(out, "WEBP", quality=quality, method=6)
    total += out.stat().st_size
print(f"{i + 1} frames, {total / 1024:.0f} KB")
