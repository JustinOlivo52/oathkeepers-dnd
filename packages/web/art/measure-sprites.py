"""Measure each catalog sprite's visibleHeight (feet to top of the idle pose) and write it to the catalog.

Run after adding or changing any battle sprite: python3 packages/web/art/measure-sprites.py
Requires Python 3 and Pillow. The game uses visibleHeight to place health bars above heads.
"""
import json
from pathlib import Path
from PIL import Image

REPO = Path(__file__).resolve().parents[3]
CATALOG = REPO / "packages/content/data/art-catalog.json"
ASSETS = REPO / "packages/web/public/assets"

catalog = json.loads(CATALOG.read_text())
for entry in catalog:
    sprite = entry.get("sprite")
    if not sprite:
        continue
    sheet = Image.open(ASSETS / sprite["file"]).convert("RGBA")
    idle = sheet.crop((0, 0, sprite["frameWidth"], sprite["frameHeight"]))
    top = idle.getbbox()[1]
    anchor_y = sprite.get("anchor", {}).get("y", round(sprite["frameHeight"] * 0.865))
    sprite["visibleHeight"] = anchor_y - top
    print(f'{entry["id"]}: visibleHeight {sprite["visibleHeight"]}')
CATALOG.write_text(json.dumps(catalog, indent=2) + "\n")
