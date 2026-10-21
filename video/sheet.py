"""Tile review stills into one sheet: python sheet.py out/sheet.png out/shots/20.png ..."""
import sys
from PIL import Image, ImageDraw

out, files = sys.argv[1], sys.argv[2:]
w, h, cols = 640, 360, 3
rows = (len(files) + cols - 1) // cols
sheet = Image.new('RGB', (w * cols, h * rows), 'black')
for i, f in enumerate(files):
    im = Image.open(f).convert('RGB').resize((w, h))
    ImageDraw.Draw(im).text((8, 6), f.split('/')[-1], fill=(255, 255, 0))
    sheet.paste(im, ((i % cols) * w, (i // cols) * h))
sheet.save(out)
