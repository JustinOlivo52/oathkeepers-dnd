"""Export reviewed generated monster portraits to the art library.

This only resizes and encodes source raster artwork; it draws no artwork.
Usage: python3 portrait-processing.py source/library1/skeleton-portrait-source.png skeleton
"""
from pathlib import Path
import sys
from PIL import Image, ImageOps

WEB = Path(__file__).resolve().parents[3]


def export(source, monster_id):
    image = Image.open(source).convert("RGB")
    image = ImageOps.fit(image, (512, 512), method=Image.Resampling.LANCZOS)
    output = WEB / "public/assets/library/portraits" / f"monster-{monster_id}.webp"
    output.parent.mkdir(parents=True, exist_ok=True)
    quality = 85
    while True:
        image.save(output, "WEBP", quality=quality, method=6)
        if output.stat().st_size < 150_000:
            break
        quality -= 5
        if quality < 40:
            raise ValueError(f"Cannot meet portrait byte budget: {monster_id}")
    print(output, image.size, output.stat().st_size, f"quality={quality}")


if __name__ == "__main__":
    export(Path(sys.argv[1]), sys.argv[2])
