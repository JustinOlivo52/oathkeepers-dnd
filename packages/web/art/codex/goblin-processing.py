"""Register the original generated 4x3 goblin atlas as the game's 11-frame strip.

Only crops, alpha cleanup, nearest-neighbor resizing and placement are performed.
Run from repository root: python3 packages/web/art/codex/goblin-processing.py
"""
from pathlib import Path
from statistics import median
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'art/codex/source/goblin-source.png'
OUTPUT = ROOT / 'public/assets/sprites/goblin.png'
SIZE = 192


def main():
    source = Image.open(SOURCE).convert('RGBA')
    width, height = source.size
    cells = []
    for i in range(11):
        col, row = i % 4, i // 4
        cell = source.crop((round(col * width / 4), round(row * height / 3),
                            round((col + 1) * width / 4), round((row + 1) * height / 3)))
        # Eliminate nearly transparent output noise while retaining designed edges.
        alpha = cell.getchannel('A').point(lambda a: 255 if a >= 128 else 0)
        cell.putalpha(alpha)
        cells.append(cell)

    bounds = [cell.getbbox() for cell in cells]
    if any(box is None for box in bounds):
        raise ValueError('All eleven animation cells must contain artwork')
    # One shared scale preserves anatomy across poses. Down does not grow to full height.
    idle_height = median(bounds[i][3] - bounds[i][1] for i in range(2))
    factor = 95 / idle_height
    largest_width = max(box[2] - box[0] for box in bounds)
    factor = min(factor, 176 / largest_width)
    strip = Image.new('RGBA', (SIZE * 11, SIZE))
    for i, (cell, box) in enumerate(zip(cells, bounds)):
        art = cell.crop(box)
        art = art.resize((max(1, round(art.width * factor)), max(1, round(art.height * factor))), Image.Resampling.NEAREST)
        if i == 10:
            anchor_x = (box[0] + box[2]) / 2
        else:
            # Foot-space midpoint, not sword-inclusive silhouette center.
            foot_band = cell.getchannel('A').crop((0, max(box[1], box[3] - round(idle_height * .13)), cell.width, box[3]))
            feet = foot_band.getbbox()
            anchor_x = (feet[0] + feet[2]) / 2 if feet else (box[0] + box[2]) / 2
        x = round(96 - (anchor_x - box[0]) * factor)
        y = 166 - art.height
        if x < 0 or x + art.width > SIZE or y < 0:
            raise ValueError(f'Frame {i} clips: {x}, {y}, {art.size}')
        strip.alpha_composite(art, (i * SIZE + x, y))
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    strip.save(OUTPUT, optimize=True)
    print(f'{OUTPUT}: {strip.size}; shared source scale {factor:.4f}')
    print('Frame alpha bounds:', [strip.crop((i * SIZE, 0, (i + 1) * SIZE, SIZE)).getbbox() for i in range(11)])


if __name__ == '__main__':
    main()
