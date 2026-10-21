"""Repack generated originals and validate the public animation contract.
Requires Python 3 and Pillow. No game artwork is drawn by these scripts.
"""
import json
import subprocess
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
WEB = HERE.parents[1]
REPO = WEB.parents[1]
OUT = WEB / "public/assets/sprites"
NAMES = ["hero-martial", "hero-expert", "hero-arcane", "hero-divine", "goblin", "tiles"]
ANIMATIONS = {
    "idle": {"frames": [0, 1], "fps": 2, "loop": True},
    "walk": {"frames": [2, 3, 4, 5], "fps": 8, "loop": True},
    "attack": {"frames": [6, 7, 8, 0], "fps": 8, "loop": False},
    "hit": {"frames": [9, 0], "fps": 6, "loop": False},
    "down": {"frames": [10], "fps": 1, "loop": False},
}

for name in NAMES[:4]:
    subprocess.run([sys.executable, str(HERE / "hero-processing.py"), str(HERE / "source" / f"{name}.png"), name], check=True)

for script in ["goblin-processing.py", "terrain-processing.py"]:
    subprocess.run([sys.executable, str(HERE / script)], check=True)

manifest = {}
for name in NAMES:
    size, count = (128, 5) if name == "tiles" else (192, 11)
    image = Image.open(OUT / f"{name}.png").convert("RGBA")
    assert image.size == (size * count, size), (name, image.size)
    for frame in range(count):
        cell = image.crop((frame * size, 0, (frame + 1) * size, size))
        assert cell.getbbox(), (name, frame, "empty")
        if name != "tiles":
            bounds = cell.getbbox()
            assert bounds[0] > 0 and bounds[2] < size and bounds[1] > 0 and bounds[3] < size, (name, frame, "clips")
            assert cell.getchannel("A").getextrema() == (0, 255), (name, frame, "no transparency")
    manifest[name] = {"image": f"{name}.png", "frameWidth": size, "frameHeight": size,
                      "animations": {} if name == "tiles" else ANIMATIONS}
    if name == "tiles":
        manifest[name]["named"] = {"floor": [0, 1, 2], "wall": 3, "rubble": 4}
(OUT / "sprites.json").write_text(json.dumps(manifest, indent=2) + "\n")

# Contact sheet: same six-row, left-to-right animation layout as Claude's original.
scale = 1.5
cell = 300
margin = 20
header = 52
preview = Image.new("RGB", (11 * cell + margin * 2, 6 * (cell + 24) + header), "#111b20")
draw = ImageDraw.Draw(preview)
try:
    font = ImageFont.truetype("DejaVuSans.ttf", 16)
    title = ImageFont.truetype("DejaVuSans.ttf", 22)
except OSError:
    font = title = ImageFont.load_default()
draw.text((margin, 12), "OATHKEEPERS / CODEX ART TRIAL — 192px character frames · 128px terrain", fill="#dfc287", font=title)
for row, name in enumerate(NAMES):
    image = Image.open(OUT / f"{name}.png").convert("RGBA")
    size = manifest[name]["frameWidth"]
    y = header + row * (cell + 24)
    draw.text((margin, y), name, fill="#e2d6bd", font=font)
    for frame in range(image.width // size):
        x = margin + frame * cell
        draw.rectangle((x, y + 24, x + cell - 8, y + cell + 16), fill="#263439", outline="#3a4a4e")
        tile = image.crop((frame * size, 0, (frame + 1) * size, size))
        tile = tile.resize((round(size * scale), round(size * scale)), Image.Resampling.NEAREST)
        if size == 128:
            tile = tile.resize((288, 288), Image.Resampling.NEAREST)
        preview.paste(tile, (x + 2, y + 26), tile)
        draw.text((x + 8, y + 29), str(frame), fill="#a8b9b9", font=font)
path = REPO / "docs/art/art-trial-codex.png"
preview.save(path, optimize=True)
print(f"Validated 55 character frames, 5 terrain frames, and wrote {path}")
