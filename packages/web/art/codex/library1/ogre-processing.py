"""Register original generated ogre atlas as eleven Large 384px frames.

Only alpha cleanup, cropping, nearest-neighbor resize and registration are used.
"""
from pathlib import Path
from statistics import median
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / 'art/codex/source/library1/ogre-source.png'
OUTPUT = ROOT / 'public/assets/sprites/monster-ogre.png'
SIZE = 384


def main():
    source = Image.open(SOURCE).convert('RGBA')
    width, height = source.size
    cells = []
    for i in range(11):
        col, row = i % 4, i // 4
        # The generated recovery club/down pose extend beyond nominal columns.
        # Reviewed transparent gutters give these exact source crop boundaries;
        # unlike a rigid grid crop, these preserve the complete original artwork.
        x0, x1 = round(col * width / 4), round((col + 1) * width / 4)
        if row == 2:
            x0, x1 = [(0, 400), (400, 718), (718, 1125)][col]
        cell = source.crop((x0, round(row * height / 3), x1, round((row + 1) * height / 3)))
        cell.putalpha(cell.getchannel('A').point(lambda a: 255 if a >= 128 else 0))
        cells.append(cell)
    bounds = [cell.getbbox() for cell in cells]
    if any(box is None for box in bounds):
        raise ValueError('All eleven animation cells must contain artwork')
    factor = 256 / median(bounds[i][3] - bounds[i][1] for i in range(2))
    factor = min(factor, 350 / max(box[2] - box[0] for box in bounds),
                 324 / max(box[3] - box[1] for box in bounds))
    strip = Image.new('RGBA', (SIZE * 11, SIZE))
    for i, (cell, box) in enumerate(zip(cells, bounds)):
        art = cell.crop(box)
        art = art.resize((max(1, round(art.width * factor)), max(1, round(art.height * factor))), Image.Resampling.NEAREST)
        if i == 10:
            anchor_x = (box[0] + box[2]) / 2
        else:
            # Reviewed midpoint of BOTH feet (including raised gait foot).
            # A bottom alpha band would anchor the knee-lift on one planted foot,
            # producing large sideways jumps and mistaking the low club for toes.
            source_anchors = [183, 554, 911, 1276, 186, 566, 935, 1254, 185, 573]
            crop_left = (i % 4) * width / 4 if i < 8 else [0, 400][i - 8]
            anchor_x = source_anchors[i] - crop_left
        x = round(192 - (anchor_x - box[0]) * factor)
        y = 340 - art.height
        if x <= 0 or x + art.width >= SIZE or y <= 0:
            raise ValueError(f'Frame {i} clips: {x}, {y}, {art.size}')
        strip.alpha_composite(art, (i * SIZE + x, y))
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    strip.save(OUTPUT, optimize=True)
    print(f'{OUTPUT}: {strip.size}; shared source scale {factor:.4f}')
    print('Frame alpha bounds:', [strip.crop((i * SIZE, 0, (i + 1) * SIZE, SIZE)).getbbox() for i in range(11)])


if __name__ == '__main__':
    main()
