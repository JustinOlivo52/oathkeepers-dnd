"""Check delivered files and build a complete static review without generating art."""
from pathlib import Path
import json
from PIL import Image, ImageDraw

REPO = Path(__file__).resolve().parents[5]
ASSETS = REPO / 'packages/web/public/assets'
DOCS = REPO / 'docs/art'

def main():
    catalog = json.loads((REPO / 'packages/content/data/art-catalog.json').read_text())
    ids = [e['id'] for e in catalog]
    assert len(ids) == len(set(ids)), 'Duplicate catalog ids'
    rows, records = [], []
    for entry in catalog:
        paths = [entry.get(k) for k in ('image', 'board', 'props')]
        if entry.get('sprite'): paths.append(entry['sprite']['file'])
        if entry.get('vfx'): paths.append(entry['vfx']['file'])
        if entry['kind'] == 'tileset': paths.append(entry.get('tiles'))
        for path in filter(None, paths): assert (ASSETS / path).is_file(), (entry['id'], path)
        if entry.get('integrationStatus') != 'pending': continue
        row = Image.new('RGB', (1600, 240), '#17272c')
        draw = ImageDraw.Draw(row)
        draw.text((12, 8), entry['id'] + ' | integration pending', fill='#ead3a2')
        record = {'id': entry['id'], 'files': list(filter(None, paths))}
        if entry.get('sprite'):
            spec = entry['sprite']; sheet = Image.open(ASSETS / spec['file']).convert('RGBA')
            w, h = spec['frameWidth'], spec['frameHeight']
            assert sheet.size == (w * 11, h), (entry['id'], sheet.size)
            bounds = []
            for i in range(11):
                frame = sheet.crop((i*w, 0, (i+1)*w, h))
                box = frame.getbbox()
                assert box and box[0] > 0 and box[1] > 0 and box[2] < w and box[3] < h, (entry['id'], i, box)
                assert frame.getchannel('A').getextrema() == (0, 255)
                bounds.append(box)
                frame.thumbnail((140, 180), Image.Resampling.NEAREST)
                row.paste(frame, (i*145, 40), frame)
                draw.text((i*145+8, 220), str(i), fill='white')
            record['frameBounds'] = bounds
        elif entry.get('image'):
            path = ASSETS / entry['image']; im = Image.open(path)
            size = (1600, 900) if entry['kind'] == 'scene' else (512, 512)
            budget = 400000 if entry['kind'] == 'scene' else 150000
            assert im.size == size and path.stat().st_size < budget, entry['id']
            record.update(dimensions=list(im.size), bytes=path.stat().st_size)
            im.thumbnail((380, 200)); row.paste(im, (12, 30))
        elif entry['kind'] == 'tileset':
            sheet = Image.open(ASSETS / entry['tiles']); assert sheet.size == (640, 128)
            row.paste(sheet, (12, 40))
            if entry.get('props'):
                props = Image.open(ASSETS / entry['props']).convert('RGBA'); assert props.size == (256, 256)
                props.thumbnail((180, 180)); row.paste(props, (680, 40), props)
        elif entry['kind'] == 'board':
            board = json.loads((ASSETS / entry['board']).read_text())
            tiles = next(e for e in catalog if e['id'] == board['tileset'])
            atlas = Image.open(ASSETS / tiles['tiles'])
            for y, line in enumerate(board['rows']):
                for x, cell in enumerate(line):
                    index = 3 if cell == '#' else 4 if cell == '~' else (x+y)%3
                    tile = atlas.crop((index*128, 0, (index+1)*128, 128)).resize((12, 12))
                    row.paste(tile, (12+x*12, 32+y*12))
            draw.text((340, 40), 'Terrain preview; props rendering and gameplay review still required.', fill='white')
        rows.append(row); records.append(record)
    out = Image.new('RGB', (1600, len(rows)*240), '#17272c')
    for i, row in enumerate(rows): out.paste(row, (0, i*240))
    out.save(DOCS / 'library-batch-2-complete.jpg', quality=88)
    report = {'catalogEntries': len(catalog), 'pendingEntries': len(records), 'staticChecks': 'passed',
              'scope': 'File existence, dimensions, byte budgets, sprite alpha and frame bounds; no gameplay approval.', 'entries': records}
    (DOCS / 'library-batch-2-static-check.json').write_text(json.dumps(report, indent=2)+'\n')
    print(f'Passed: {len(catalog)} catalog entries; reviewed {len(records)} pending entries')

if __name__ == '__main__': main()
