"""Repaint photos as Van Gogh-style brushwork: short, thick strokes laid along the image's contours
(perpendicular to the brightness gradient), colours taken from the photo and pushed a little warmer.
  python scripts/paint.py in.jpg out.jpg [width]
"""
import math
import random
import sys

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

src, dst = sys.argv[1], sys.argv[2]
width = int(sys.argv[3]) if len(sys.argv) > 3 else 900
random.seed(7)

im = Image.open(src).convert('RGB')
im = im.resize((width, int(im.height * width / im.width)), Image.LANCZOS)
im = ImageEnhance.Color(im).enhance(1.35)
im = ImageEnhance.Contrast(im).enhance(1.1)
w, h = im.size
px = im.load()
gray = im.convert('L').filter(ImageFilter.GaussianBlur(3))
g = gray.load()

# Under-painting: the photo, blurred, so gaps between strokes aren't bare.
canvas = im.filter(ImageFilter.GaussianBlur(6))
draw = ImageDraw.Draw(canvas)


def angle_at(x, y):
    x0, x1 = max(0, x - 2), min(w - 1, x + 2)
    y0, y1 = max(0, y - 2), min(h - 1, y + 2)
    gx = g[x1, y] - g[x0, y]
    gy = g[x, y1] - g[x, y0]
    if abs(gx) + abs(gy) < 2:  # flat area: gentle swirl instead
        return math.sin(x / 60) + math.cos(y / 70)
    return math.atan2(gy, gx) + math.pi / 2  # along the contour


def warm(c):
    r, gg, b = c
    return (min(255, int(r * 1.05 + 6)), min(255, int(gg * 1.02 + 2)), int(b * 0.96))


# Three passes: big strokes, then medium, then fine detail on top.
for size, count, length in [(9, 9000, 22), (6, 16000, 14), (3, 22000, 8)]:
    s = size * width / 900
    for _ in range(int(count * (w * h) / (900 * 1125))):
        x, y = random.randrange(w), random.randrange(h)
        a = angle_at(x, y) + random.uniform(-0.25, 0.25)
        L = length * width / 900 * random.uniform(0.7, 1.3)
        dx, dy = math.cos(a) * L / 2, math.sin(a) * L / 2
        col = warm(px[x, y])
        jitter = random.randint(-12, 12)
        col = tuple(max(0, min(255, c + jitter)) for c in col)
        draw.line([(x - dx, y - dy), (x + dx, y + dy)], fill=col, width=max(1, int(s)))
        # a highlight edge on each stroke, like thick paint catching light
        hl = tuple(min(255, c + 28) for c in col)
        draw.line([(x - dx * 0.6, y - dy * 0.6 - s * 0.3), (x + dx * 0.6, y + dy * 0.6 - s * 0.3)], fill=hl, width=max(1, int(s * 0.35)))

canvas = canvas.filter(ImageFilter.SMOOTH_MORE)
canvas.save(dst, quality=90)
print(dst, canvas.size)
