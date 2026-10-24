"""Export four existing spell illustrations. Requires Python and Pillow; no generation.

Run from any directory. Reviewed crop boxes follow the painted cards, rather than
assuming the generated atlas obeys the requested equal-cell grid.
"""
from pathlib import Path
import hashlib
import json
from PIL import Image

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[4]
SOURCE = HERE.parent / 'source/completion/icons-0.png'
OUTPUT = REPO / 'packages/web/public/assets/library/icons'
DOCS = REPO / 'docs/art'
ITEMS = [
    ('fire-bolt', 'Fire Bolt', (32, 12, 281, 259)),
    ('ray-of-frost', 'Ray of Frost', (303, 12, 551, 259)),
    ('shocking-grasp', 'Shocking Grasp', (570, 13, 821, 259)),
    ('acid-splash', 'Acid Splash', (842, 13, 1090, 259)),
]


def main(items=ITEMS, checkpoint=1, source_overrides=None):
    source_bytes = SOURCE.read_bytes()
    source = Image.open(SOURCE).convert('RGBA')
    assert source.size == (1122, 1402), 'Source changed; review crop boxes first'
    assert hashlib.sha256(source_bytes).hexdigest() == SOURCE_SHA256, 'Source changed; review first'
    # Preflight every additional atlas before writing any files.
    alternate_sources = {}
    for spell, (path, expected_hash, expected_size) in (source_overrides or {}).items():
        path = Path(path)
        actual_hash = hashlib.sha256(path.read_bytes()).hexdigest()
        assert actual_hash == expected_hash, f'{path}: source changed; review first'
        atlas = Image.open(path).convert('RGBA')
        assert atlas.size == expected_size, f'{path}: source dimensions changed'
        alternate_sources[spell] = (atlas, str(path.relative_to(REPO)), actual_hash)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    DOCS.mkdir(parents=True, exist_ok=True)
    catalog_path = REPO / 'packages/content/data/art-catalog.json'
    catalog = json.loads(catalog_path.read_text())
    report = {'source': str(SOURCE.relative_to(REPO)), 'sourceSha256': SOURCE_SHA256, 'icons': []}
    columns = 4 if len(items) <= 4 else 5
    preview = Image.new('RGB', (columns * 160, ((len(items)+columns-1)//columns)*210), '#24262b')
    from PIL import ImageDraw
    draw = ImageDraw.Draw(preview)
    for index, (spell, title, box) in enumerate(items):
        # Crop to the reviewed painted card border, then retain transparent margins.
        atlas, source_path, source_hash = alternate_sources.get(
            spell, (source, str(SOURCE.relative_to(REPO)), SOURCE_SHA256))
        assert 0 <= box[0] < box[2] <= atlas.width and 0 <= box[1] < box[3] <= atlas.height, spell
        crop = atlas.crop(box)
        crop.thumbnail((60, 60), Image.Resampling.LANCZOS)
        icon = Image.new('RGBA', (64, 64))
        icon.alpha_composite(crop, ((64-crop.width)//2, (64-crop.height)//2))
        asset_id = 'icon-' + spell
        path = OUTPUT / (asset_id + '.png')
        icon.save(path, optimize=True)
        bounds = icon.getbbox()
        assert bounds and all(v > 0 for v in bounds[:2]) and all(v < 64 for v in bounds[2:]), asset_id
        assert icon.getchannel('A').getextrema() == (0, 255), asset_id
        assert path.stat().st_size < 20000, asset_id
        relative = str(path.relative_to(REPO / 'packages/web/public/assets'))
        existing = next((e for e in catalog if e['id'] == asset_id), None)
        entry = dict(id=asset_id, kind='icon', title=title + ' icon', tags=[], image=relative,
                     artStatus='ready', mechanicsStatus='not-required', integrationStatus='pending',
                     source='codex-imagegen', added='2026-10-24')
        if existing:
            assert existing['image'] == relative, 'Refusing conflicting catalog path'
        else:
            catalog.append(entry)
        report['icons'].append(dict(id=asset_id, image=relative, sourceCrop=list(box),
                                   width=64, height=64, bytes=path.stat().st_size,
                                   sha256=hashlib.sha256(path.read_bytes()).hexdigest()))
        if source_overrides:
            report['icons'][-1].update(source=source_path, sourceSha256=source_hash)
        x = (index % columns) * 160 + 48
        y = (index // columns) * 210
        preview.paste(icon, (x, y+30), icon)
        tiny = icon.resize((20, 20), Image.Resampling.LANCZOS)
        preview.paste(tiny, (x+22, y+115), tiny)
        draw.text(((index % columns)*160+8, y+160), title, fill='white')
    assert len({e['id'] for e in catalog}) == len(catalog), 'Duplicate catalog id'
    catalog_path.write_text(json.dumps(catalog, indent=2)+'\n')
    preview.save(DOCS / f'spell-icons-checkpoint-{checkpoint}.png')
    (DOCS / f'spell-icons-checkpoint-{checkpoint}.json').write_text(json.dumps(report, indent=2)+'\n')
    print(json.dumps(report, indent=2))


SOURCE_SHA256 = '783874062c33a9fcb42f3db12cdff969b2b899decc8974e747e51b3ba0b9db88'
if __name__ == '__main__':
    main()
