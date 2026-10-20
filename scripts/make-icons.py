"""Draws the Flotsam icon (a plank floating on two waves) and writes public/icon.svg plus the PNG set.

Run from the repo root:  python scripts/make-icons.py
Needs Pillow. Outputs are committed, so this only runs when the design changes.
"""
import math
from pathlib import Path
from PIL import Image, ImageDraw

BG = (14, 17, 19)        # #0e1113
WAVE = (34, 204, 153)    # #22cc99
WOOD = (232, 200, 138)   # #e8c88a
S = 1024
DY = -95  # lifts the glyph so it is optically centred

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public"


def wave_points(y0, amp, phase, x0=140, x1=884, n=120):
    y0 += DY
    return [(x0 + (x1 - x0) * i / n, y0 + amp * math.sin(i / n * 2 * math.pi * 1.5 + phase)) for i in range(n + 1)]


def plank_polygon(cx, cy, w, h, deg):
    a = math.radians(deg)
    pts = []
    for dx, dy in [(-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)]:
        pts.append((cx + dx * math.cos(a) - dy * math.sin(a), cy + dx * math.sin(a) + dy * math.cos(a)))
    return pts


def draw(scale=1.0, rounded=True):
    """Full-canvas drawing. `scale` shrinks the glyph toward the centre (maskable safe zone)."""
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if rounded:
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=224, fill=BG)
    else:
        d.rectangle([0, 0, S, S], fill=BG)

    def t(p):  # scale about the centre
        return (S / 2 + (p[0] - S / 2) * scale, S / 2 + (p[1] - S / 2) * scale)

    width = int(46 * scale)
    for y0, phase in [(690, 0.0), (790, 1.2)]:
        # Stamp circles along a dense path: smoother than a wide polyline (no joint artifacts).
        for p in (t(q) for q in wave_points(y0, 34, phase, n=600)):
            d.ellipse([p[0] - width / 2, p[1] - width / 2, p[0] + width / 2, p[1] + width / 2], fill=WAVE)
    d.polygon([t(p) for p in plank_polygon(512, 520 + DY, 440, 84, -12)], fill=WOOD)
    d.polygon([t(p) for p in plank_polygon(560, 440 + DY, 200, 60, 14)], fill=(196, 160, 100))
    return img


def svg():
    def pts(y0, phase):
        return " ".join(f"{x:.0f},{y:.0f}" for x, y in wave_points(y0, 34, phase, n=60))

    def poly(cx, cy, w, h, deg, fill):
        p = " ".join(f"{x:.0f},{y:.0f}" for x, y in plank_polygon(cx, cy, w, h, deg))
        return f'<polygon points="{p}" fill="{fill}"/>'

    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {S} {S}">'
        f'<rect width="{S}" height="{S}" rx="224" fill="#0e1113"/>'
        f'<polyline points="{pts(690, 0.0)}" fill="none" stroke="#22cc99" stroke-width="46" stroke-linecap="round" stroke-linejoin="round"/>'
        f'<polyline points="{pts(790, 1.2)}" fill="none" stroke="#22cc99" stroke-width="46" stroke-linecap="round" stroke-linejoin="round"/>'
        + poly(512, 520 + DY, 440, 84, -12, "#e8c88a")
        + poly(560, 440 + DY, 200, 60, 14, "#c4a064")
        + "</svg>"
    )


def save(img, name, size):
    (OUT / "icons").mkdir(parents=True, exist_ok=True)
    img.resize((size, size), Image.LANCZOS).save(OUT / "icons" / name)


if __name__ == "__main__":
    normal = draw(1.0, rounded=True)
    maskable = draw(0.62, rounded=False)  # glyph inside the ~80% safe zone, full-bleed background
    save(normal, "icon-192.png", 192)
    save(normal, "icon-512.png", 512)
    save(maskable, "maskable-512.png", 512)
    save(draw(0.9, rounded=False), "apple-touch-icon.png", 180)  # iOS rounds the corners itself
    (OUT / "icon.svg").write_text(svg(), encoding="utf-8")
    print("wrote", sorted(p.name for p in (OUT / "icons").iterdir()), "and icon.svg")
