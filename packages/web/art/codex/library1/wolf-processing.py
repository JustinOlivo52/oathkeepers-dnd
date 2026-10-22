"""Crop/register the generated wolf atlas without drawing or synthesizing poses.

Run from repo root: python3 packages/web/art/codex/library1/wolf-processing.py
"""
from pathlib import Path
from statistics import median
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / 'art/codex/source/library1/wolf-source.png'
OUTPUT = ROOT / 'public/assets/sprites/monster-wolf.png'
SIZE = 192


def main():
    source = Image.open(SOURCE).convert('RGBA')
    width, height = source.size
    cells = []
    for i in range(11):
        col, row = i % 4, i // 4
        cell = source.crop((round(col * width / 4), round(row * height / 3),
                            round((col + 1) * width / 4), round((row + 1) * height / 3)))
        cell.putalpha(cell.getchannel('A').point(lambda a: 255 if a >= 128 else 0))
        cells.append(cell)
    bounds = [cell.getbbox() for cell in cells]
    if any(box is None for box in bounds):
        raise ValueError('All eleven animation cells must contain artwork')
    factor = 125 / median(bounds[i][2] - bounds[i][0] for i in range(2))
    factor = min(factor, 174 / max(box[2] - box[0] for box in bounds))
    strip = Image.new('RGBA', (SIZE * 11, SIZE))
    for i, (cell, box) in enumerate(zip(cells, bounds)):
        art = cell.crop(box)
        art = art.resize((max(1, round(art.width * factor)), max(1, round(art.height * factor))), Image.Resampling.NEAREST)
        if i == 10:
            anchor_x = (box[0] + box[2]) / 2
        else:
            band_height = max(2, round((box[3] - box[1]) * .16))
            feet = cell.getchannel('A').crop((0, box[3] - band_height, cell.width, box[3])).getbbox()
            anchor_x = (feet[0] + feet[2]) / 2 if feet else (box[0] + box[2]) / 2
        x = round(96 - (anchor_x - box[0]) * factor)
        y = 166 - art.height
        if x <= 0 or x + art.width >= SIZE or y <= 0:
            raise ValueError(f'Frame {i} clips: {x}, {y}, {art.size}')
        strip.alpha_composite(art, (i * SIZE + x, y))
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    strip.save(OUTPUT, optimize=True)
    print(f'{OUTPUT}: {strip.size}; shared source scale {factor:.4f}')
    print('Frame alpha bounds:', [strip.crop((i * SIZE, 0, (i + 1) * SIZE, SIZE)).getbbox() for i in range(11)])


if __name__ == '__main__':
    main()
