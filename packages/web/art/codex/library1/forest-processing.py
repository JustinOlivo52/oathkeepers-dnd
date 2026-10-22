"""Repack generated forest atlas cells; no artwork is drawn in code.

Run: python3 packages/web/art/codex/library1/forest-processing.py
Requires Pillow. Source is preserved in source/library1/forest-tiles-source.png.
"""
from pathlib import Path
from PIL import Image

CODEX = Path(__file__).resolve().parents[1]
WEB = CODEX.parents[1]
SOURCE = CODEX / "source" / "library1" / "forest-tiles-source.png"
OUTPUT = WEB / "public" / "assets" / "sprites" / "tiles-forest.png"


def main():
    source = Image.open(SOURCE).convert("RGBA")
    result = Image.new("RGBA", (640, 128))
    for index in range(5):
        col, row = index % 3, index // 3
        bounds = (round(col * source.width / 3), round(row * source.height / 2),
                  round((col + 1) * source.width / 3), round((row + 1) * source.height / 2))
        cell = source.crop(bounds).resize((128, 128), Image.Resampling.NEAREST)
        result.paste(cell, (index * 128, 0))
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    result.save(OUTPUT, optimize=True)
    print(f"Exported {OUTPUT}: {result.width}x{result.height}, five128x128 frames")


if __name__ == "__main__":
    main()
