"""Contact sheet of QA screenshots: python qa/sheet.py <out.png> <cols> <thumb-width> file1 file2 ..."""
import sys
from PIL import Image, ImageDraw

out, cols, tw = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
files = sys.argv[4:]
ims = [Image.open(f).convert('RGB') for f in files]
th = int(tw * ims[0].height / ims[0].width)
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (cols * (tw + 8) + 8, rows * (th + 30) + 8), (40, 40, 40))
d = ImageDraw.Draw(sheet)
for i, (f, im) in enumerate(zip(files, ims)):
    x = 8 + (i % cols) * (tw + 8)
    y = 8 + (i // cols) * (th + 30)
    sheet.paste(im.resize((tw, th), Image.LANCZOS), (x, y + 22))
    d.text((x + 2, y + 4), f.split('-')[-1].replace('.png', ''), fill=(255, 255, 255))
sheet.save(out)
