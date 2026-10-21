"""Repack generated 4×3 atlases into the runtime's eleven-frame rows.

This does no illustration: it crops, removes alpha dust, registers feet, and
resizes generated raster artwork with nearest-neighbor sampling. Original
generated atlases stay in source/ for future animation and registration work.
Run: python3 hero-processing.py source/hero-martial.png hero-martial
"""
from pathlib import Path
import sys
from statistics import median
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SIZE = 192
FOOT = (96, 166)


def clean_alpha(alpha):
    """Discard only tiny detached generation fragments, keeping pose artwork."""
    pix = alpha.load()
    seen = set()
    groups = []
    for y in range(alpha.height):
        for x in range(alpha.width):
            if not pix[x, y] or (x, y) in seen:
                continue
            group, stack = [], [(x, y)]
            seen.add((x, y))
            while stack:
                px, py = stack.pop()
                group.append((px, py))
                for nx, ny in ((px-1, py), (px+1, py), (px, py-1), (px, py+1)):
                    if (0 <= nx < alpha.width and 0 <= ny < alpha.height
                            and pix[nx, ny] and (nx, ny) not in seen):
                        seen.add((nx, ny))
                        stack.append((nx, ny))
            groups.append(group)
    largest = max(map(len, groups), default=0)
    for group in groups:
        if len(group) < max(12, largest * .04):
            for x, y in group:
                pix[x, y] = 0
    return alpha


def repack(source: Path, name: str):
    atlas = Image.open(source).convert("RGBA")
    width, height = atlas.size
    cells = []
    for i in range(11):
        col, row = i % 4, i // 4
        right = round((col + 1) * width / 4)
        # A generated down pose uses some of the deliberately empty last cell.
        if i == 10:
            right = width
        if i == 8:
            right += 36
        cell = atlas.crop((round(col * width / 4), round(row * height / 3),
                           right, round((row + 1) * height / 3)))
        alpha = clean_alpha(cell.getchannel("A").point(lambda a: 0 if a < 20 else 255))
        cell.putalpha(alpha)
        bounds = alpha.getbbox()
        if not bounds:
            raise ValueError(f"{name}: empty generated cell {i}")
        cells.append(cell.crop(bounds))

    # One shared scale protects limb and equipment size across a whole cycle.
    scale = min(128 / median(c.height for c in cells[:6]),
                180 / max(c.width for c in cells),
                158 / max(c.height for c in cells))
    sheet = Image.new("RGBA", (SIZE * 11, SIZE))
    for i, cell in enumerate(cells):
        cell = cell.resize((max(1, round(cell.width * scale)),
                            max(1, round(cell.height * scale))), Image.Resampling.NEAREST)
        # Feet rather than weapon bounds establish the frame's ground anchor.
        if i == 10:
            foot_x = cell.width / 2
        else:
            a = cell.getchannel("A")
            pts = [(x, y) for y in range(round(cell.height * .85), cell.height)
                   for x in range(cell.width) if a.getpixel((x, y))]
            foot_x = median(x for x, _ in pts) if pts else cell.width / 2
        ox = round(FOOT[0] - foot_x)
        oy = FOOT[1] - cell.height
        # Preserve all blade tips even for a wide horizontal strike.
        ox = max(5, min(SIZE - 5 - cell.width, ox))
        sheet.alpha_composite(cell, (i * SIZE + ox, oy))
    out = ROOT / "public/assets/sprites" / f"{name}.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out)
    print(f"{out}: {sheet.size}, scale={scale:.3f}")


if __name__ == "__main__":
    repack(Path(sys.argv[1]), sys.argv[2])
