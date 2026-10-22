"""Convert preserved generated story art to size-bounded WebP library assets.

No artwork is drawn in code. Center cropping, nearest-neighbour resizing, and
WebP compression only. Run from any directory; requires Pillow.
"""
from pathlib import Path
from PIL import Image, ImageOps

CODEX = Path(__file__).resolve().parents[1]
WEB = CODEX.parents[1]
SOURCE = CODEX / "source" / "library1"
OUTPUT = WEB / "public" / "assets" / "library"
ASSETS = [
    ("scene-forest-road-day", "scenes", (1600, 900), 400_000),
    ("scene-tavern-night", "scenes", (1600, 900), 400_000),
    ("npc-innkeeper-dwarf", "portraits", (512, 512), 150_000),
    ("npc-guard-captain", "portraits", (512, 512), 150_000),
    ("npc-merchant", "portraits", (512, 512), 150_000),
]


def main():
    for name, folder, size, budget in ASSETS:
        source = SOURCE / f"{name}-source.png"
        if not source.exists():
            continue
        result = ImageOps.fit(Image.open(source).convert("RGB"), size,
                              method=Image.Resampling.NEAREST, centering=(0.5, 0.5))
        output = OUTPUT / folder / f"{name}.webp"
        output.parent.mkdir(parents=True, exist_ok=True)
        for quality in (85, 82, 78, 74, 70, 65, 60):
            result.save(output, format="WEBP", quality=quality, method=6)
            if output.stat().st_size < budget:
                break
        if output.stat().st_size >= budget:
            raise ValueError(f"{name}: exceeds {budget}-byte budget")
        print(f"{output}: {size}, {output.stat().st_size}bytes, WebPq{quality}")


if __name__ == "__main__":
    main()
