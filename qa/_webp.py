"""PNG exports from qa/export-stills.mjs -> public/hero3d/*.webp."""
import pathlib
from PIL import Image

src = pathlib.Path('qa/shots/export')
out = pathlib.Path('public/hero3d')
out.mkdir(parents=True, exist_ok=True)
for f in sorted(src.glob('*.png')):
    im = Image.open(f).convert('RGB')
    dst = out / (f.stem + '.webp')
    im.save(dst, 'WEBP', quality=82, method=6)
    print(dst, im.size, dst.stat().st_size // 1024, 'KB')
