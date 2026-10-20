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


def draw(scale=1.0, rounded=True, bg=True):
    """Full-canvas drawing. `scale` shrinks the glyph toward the centre (maskable safe zone)."""
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if not bg:
        pass  # glyph only, on a transparent layer (Android adaptive-icon foreground)
    elif rounded:
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


ANDROID_RES = ROOT / "android" / "app" / "src" / "main" / "res"
DENSITIES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}


def notes_glyph(size=1024):
    """Neutral launcher glyph for discreet mode: a plain notepad page, nothing that names the app."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    s = size / 1024
    d.rounded_rectangle([300 * s, 250 * s, 724 * s, 780 * s], radius=36 * s, fill=(255, 255, 255))
    for i, y in enumerate((380, 470, 560, 650)):
        d.rounded_rectangle([360 * s, y * s, (664 if i < 3 else 560) * s, (y + 26) * s], radius=13 * s, fill=(120, 120, 120))
    return img


def android():
    """Adaptive-icon layers (108dp, glyph inside the 72dp safe zone) and legacy square/round icons."""
    glyph = draw(0.66, rounded=False, bg=False)
    notes = notes_glyph()
    full = draw(1.0, rounded=True)
    for name, k in DENSITIES.items():
        d = ANDROID_RES / f"mipmap-{name}"
        d.mkdir(parents=True, exist_ok=True)
        px = int(108 * k)
        glyph.resize((px, px), Image.LANCZOS).save(d / "ic_launcher_foreground.png")
        notes.resize((px, px), Image.LANCZOS).save(d / "ic_launcher_neutral_foreground.png")
        legacy = int(48 * k)
        full.resize((legacy, legacy), Image.LANCZOS).save(d / "ic_launcher.png")
        full.resize((legacy, legacy), Image.LANCZOS).save(d / "ic_launcher_round.png")


if __name__ == "__main__":
    normal = draw(1.0, rounded=True)
    maskable = draw(0.62, rounded=False)  # glyph inside the ~80% safe zone, full-bleed background
    save(normal, "icon-192.png", 192)
    save(normal, "icon-512.png", 512)
    save(maskable, "maskable-512.png", 512)
    save(draw(0.9, rounded=False), "apple-touch-icon.png", 180)  # iOS rounds the corners itself
    (OUT / "icon.svg").write_text(svg(), encoding="utf-8")
    print("wrote", sorted(p.name for p in (OUT / "icons").iterdir()), "and icon.svg")
    if ANDROID_RES.exists():
        android()
        print("wrote Android launcher icons")
