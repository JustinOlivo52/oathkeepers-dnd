"""Export batch 2's first five generated monsters without drawing artwork.

Run from repo root: python3 packages/web/art/codex/library2/build-library.py
Preserves original generations; crops, cleans alpha, registers feet and encodes.
"""
from pathlib import Path
from statistics import median
import json
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
WEB = HERE.parents[2]
REPO = WEB.parents[1]
ASSETS = WEB / 'public/assets'
SOURCE = HERE.parent / 'source/library2'
SPECS = [
    ('goblin-boss', 'Goblin Boss', 'small', 112, ['goblinoid', 'humanoid', 'leader']),
    ('bandit', 'Bandit', 'medium', 128, ['humanoid', 'bandit', 'skirmisher']),
    ('bandit-captain', 'Bandit Captain', 'medium', 128, ['humanoid', 'bandit', 'leader']),
    ('cultist', 'Cultist', 'medium', 128, ['humanoid', 'cultist', 'caster']),
    ('bugbear-warrior', 'Bugbear Warrior', 'medium', 144, ['goblinoid', 'humanoid', 'brute']),
    ('ghoul', 'Ghoul', 'medium', 126, ['undead', 'skirmisher', 'hostile']),
    ('wight', 'Wight', 'medium', 128, ['undead', 'leader', 'hostile']),
    ('giant-rat', 'Giant Rat', 'small', 60, ['beast', 'minion', 'skirmisher']),
    ('harpy', 'Harpy', 'medium', 132, ['monstrosity', 'skirmisher', 'hostile']),
    ('dire-wolf', 'Dire Wolf', 'large', 204, ['beast', 'brute', 'hostile']),
    ('worg', 'Worg', 'large', 216, ['beast', 'monstrosity', 'brute']),
    ('brown-bear', 'Brown Bear', 'large', 222, ['beast', 'brute', 'hostile']),
    ('owlbear', 'Owlbear', 'large', 238, ['monstrosity', 'brute', 'hostile']),
]


def repack(name, target_height, size=192, prefix="monster", source_path=None):
    atlas = Image.open(source_path or SOURCE / f'{name}-source.png').convert('RGBA')
    width, height = atlas.size
    # Extract whole connected poses before registering. Generated atlas baselines
    # are approximate: rigid cell slicing can sever feet and import neighbors.
    alpha = atlas.getchannel('A').point(lambda a: 0 if a < 20 else 255)
    pixels = alpha.load()
    seen = set()
    groups = []
    for y in range(height):
        for x in range(width):
            if not pixels[x, y] or (x, y) in seen:
                continue
            group, stack = [], [(x, y)]
            seen.add((x, y))
            while stack:
                px, py = stack.pop()
                group.append((px, py))
                for nx, ny in ((px-1, py), (px+1, py), (px, py-1), (px, py+1)):
                    if 0 <= nx < width and 0 <= ny < height and pixels[nx, ny] and (nx, ny) not in seen:
                        seen.add((nx, ny))
                        stack.append((nx, ny))
            groups.append(group)
    groups.sort(key=len, reverse=True)
    assert len(groups) >= 11
    assert len(groups) == 11 or len(groups[11]) < len(groups[10]) * .02, (name, 'unexpected detached artwork')
    cells = [None] * 11
    for group in groups[:11]:
        xs, ys = zip(*group)
        left, top, right, bottom = min(xs), min(ys), max(xs)+1, max(ys)+1
        col = min(3, int((left + right) / 2 / (width / 4)))
        row = min(2, int((top + bottom) / 2 / (height / 3)))
        index = row * 4 + col
        assert index < 11 and cells[index] is None, (name, index, 'ambiguous pose')
        cell = atlas.crop((left, top, right, bottom))
        mask = Image.new('L', cell.size)
        mp = mask.load()
        for px, py in group:
            mp[px-left, py-top] = 255
        cell.putalpha(mask)
        cells[index] = cell
    assert all(cell is not None for cell in cells)
    scale = min(target_height / median(c.height for c in cells[:6]),
                (size - 12) / max(c.width for c in cells), (size * .82) / max(c.height for c in cells))
    sheet = Image.new('RGBA', (size * 11, size))
    anchor_x, anchor_y = (192, 340) if size == 384 else (96, 166)
    for i, cell in enumerate(cells):
        cell = cell.resize((max(1, round(cell.width * scale)), max(1, round(cell.height * scale))),
                           Image.Resampling.NEAREST)
        alpha = cell.getchannel('A')
        feet = [x for y in range(round(cell.height * .85), cell.height)
                for x in range(cell.width) if alpha.getpixel((x, y))]
        foot_x = median(feet) if feet and i != 10 else cell.width / 2
        x = max(5, min(size - 5 - cell.width, round(anchor_x - foot_x)))
        sheet.alpha_composite(cell, (i * size + x, anchor_y - cell.height))
    output = ASSETS / f'sprites/{prefix}-{name}.png'
    sheet.save(output, optimize=True)
    for i in range(11):
        cell = sheet.crop((i * size, 0, (i + 1) * size, size))
        bounds = cell.getbbox()
        assert bounds and bounds[0] > 0 and bounds[1] > 0 and bounds[2] < size and bounds[3] < size, (name, i, bounds)
        assert cell.getchannel('A').getextrema() == (0, 255)
    return sheet


def main():
    catalog_path = REPO / 'packages/content/data/art-catalog.json'
    catalog = json.loads(catalog_path.read_text())
    ids = {prefix + spec[0] for spec in SPECS for prefix in ('monster-', 'portrait-')}
    catalog = [entry for entry in catalog if entry['id'] not in ids]
    portraits = Image.open(SOURCE / 'portraits-source.png').convert('RGB')
    preview = Image.new('RGB', (4264, len(SPECS) * 650 + 40), '#17272c')
    draw = ImageDraw.Draw(preview)
    entries = []
    for index, (name, title, rules_size, target_height, tags) in enumerate(SPECS):
        size = 384 if rules_size == "large" else 192
        sheet = repack(name, target_height, size)
        shared = dict(tags=tags, source='codex-imagegen', added='2026-10-23',
                      artStatus='ready', integrationStatus='pending', monsterId=name)
        sprite = dict(file=f'sprites/monster-{name}.png', frameWidth=size, frameHeight=size,
                      size="large" if size == 384 else "medium", rulesSize=rules_size,
                      footprint=dict(width=size//192, height=size//192),
                      anchor=dict(x=192 if size==384 else 96, y=340 if size==384 else 166))
        sprite['visibleHeight'] = sprite['anchor']['y'] - sheet.crop((0, 0, size, size)).getbbox()[1]
        entries.append(dict(id=f'monster-{name}', kind='monster', title=title,
                            sprite=sprite, mechanicsStatus='pending', **shared))
        if index < 5:
            portraits = Image.open(SOURCE / 'portraits-source.png').convert('RGB')
            columns, rows, portrait_index = 3, 2, index
        else:
            portraits = Image.open(SOURCE / f'monster-portraits-{2+(index-5)//4}.png').convert('RGB')
            columns, rows, portrait_index = 2, 2, (index-5)%4
        col, row = portrait_index % columns, portrait_index // columns
        portrait = portraits.crop((round(col * portraits.width / columns), round(row * portraits.height / rows),
                                   round((col + 1) * portraits.width / columns), round((row + 1) * portraits.height / rows)))
        portrait = portrait.resize((512, 512), Image.Resampling.LANCZOS)
        path = ASSETS / f'library/portraits/monster-{name}.webp'
        portrait.save(path, 'WEBP', quality=85, method=6)
        assert path.stat().st_size < 150000
        entries.append(dict(id=f'portrait-{name}', kind='npc', title=f'{title} portrait',
                            image=f'library/portraits/monster-{name}.webp',
                            mechanicsStatus='not-required', **shared))
        y = 20 + index * 650
        draw.text((20, y), f'{title} | {rules_size} | frames 0-10 | mechanics / integration pending', fill='#e9c685')
        preview.paste(sheet, (20, y + 30), sheet)
        preview.paste(portrait.resize((220, 220)), (20, y + 420))
    catalog.extend(entries)
    catalog_path.write_text(json.dumps(catalog, indent=2) + '\n')
    preview.save(REPO / 'docs/art/library-batch-2.png', optimize=True)
    template = (HERE / 'review-template.html').read_text()
    (REPO / 'docs/art/library-batch-2.html').write_text(template.replace('__PILOT_DATA__', json.dumps(entries)))
    print('Exported and validated 143 transparent frames and 13 portraits; wrote catalog and review assets.')


if __name__ == '__main__':
    main()
