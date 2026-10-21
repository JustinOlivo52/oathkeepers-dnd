"""Crop/repack the generated terrain and props; no terrain is drawn in code.

Run from the repository root after preserving both generated source PNGs.
Requires Pillow. Resampling uses nearest neighbour to preserve hard pixel edges.
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SOURCE = Path(__file__).resolve().parent / "source"
OUTPUT = ROOT / "public" / "assets" / "sprites"


def cells(image, columns, rows):
    for row in range(rows):
        for col in range(columns):
            yield image.crop((round(col * image.width / columns), round(row * image.height / rows),
                              round((col + 1) * image.width / columns), round((row + 1) * image.height / rows)))


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    terrain = Image.open(SOURCE / "terrain-source.png").convert("RGBA")
    result = Image.new("RGBA", (640, 128))
    for index, cell in enumerate(list(cells(terrain, 3, 2))[:5]):
        result.paste(cell.resize((128, 128), Image.Resampling.NEAREST), (index * 128, 0))
    result.save(OUTPUT / "tiles.png", optimize=True)

    props = Image.open(SOURCE / "props-source.png").convert("RGBA")
    result = Image.new("RGBA", (256, 256))
    for index, cell in enumerate(cells(props, 2, 2)):
        result.paste(cell.resize((128, 128), Image.Resampling.NEAREST), ((index % 2) * 128, (index // 2) * 128))
    result.save(OUTPUT / "props.png", optimize=True)


if __name__ == "__main__":
    main()
