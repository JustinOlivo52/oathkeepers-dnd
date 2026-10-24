"""Reproducibly export generated source illustrations; no drawing or paid API calls."""
from pathlib import Path
import json
from PIL import Image, ImageOps, ImageDraw

REPO = Path(__file__).resolve().parents[5]
HERE = Path(__file__).resolve().parent
SOURCE = HERE.parent / 'source/library2/scenes'
ASSETS = REPO / 'packages/web/public/assets'
SPECS = [
 ('scene-thornwatch-gate-day', 'Thornwatch gate, morning', 'town gate day clear outdoor calm'),
 ('scene-thornwatch-square', 'Thornwatch market square', 'town market day outdoor festive'),
 ('scene-tavern-quiet', 'The Lantern after closing', 'tavern town night indoor calm'),
 ('scene-temple', 'Thornwatch temple', 'temple town day indoor calm'),
 ('scene-smithy', 'Thornwatch forge', 'smithy town day indoor calm'),
 ('scene-forest-night', 'Moonlit forest', 'forest night fog outdoor eerie'),
 ('scene-river-crossing', 'The old river bridge', 'river road dusk outdoor calm'),
 ('scene-farmstead', 'Abandoned farmstead', 'farm day rain outdoor somber'),
 ('scene-goblin-camp', 'Ravine encampment', 'camp hills dusk outdoor hostile'),
 ('scene-abbey-exterior', 'The fallen abbey', 'abbey ruins hills dusk outdoor eerie'),
 ('scene-cave-entrance', 'Hillside cave entrance', 'cave hills day outdoor tense'),
 ('scene-cave-depths', 'The still pool', 'cave underground eerie'),
 ('scene-crypt', 'Ancient burial vaults', 'crypt underground eerie'),
 ('scene-watchtower', 'Frontier watchtower in the storm', 'watchtower hills dusk storm outdoor tense'),
]

def main():
    path = REPO / 'packages/content/data/art-catalog.json'
    catalog = json.loads(path.read_text())
    ids = {row[0] for row in SPECS}
    catalog = [e for e in catalog if e['id'] not in ids]
    preview = Image.new('RGB', (1600, 7*490), '#17272c')
    draw = ImageDraw.Draw(preview)
    report = []
    for index, (id, title, tags) in enumerate(SPECS):
        image = ImageOps.fit(Image.open(SOURCE / f'{id}.png').convert('RGB'), (1600,900), method=Image.Resampling.LANCZOS)
        target = ASSETS / f'library/scenes/{id}.webp'
        target.parent.mkdir(parents=True, exist_ok=True)
        for quality in range(88, 49, -1):
            image.save(target, 'WEBP', quality=quality, method=6)
            if target.stat().st_size < 400000:
                break
        assert target.stat().st_size < 400000, id
        assert Image.open(target).size == (1600,900)
        catalog.append(dict(id=id, kind='scene', title=title, tags=tags.split(), image=f'library/scenes/{id}.webp',
                            artStatus='ready', mechanicsStatus='not-required', integrationStatus='pending',
                            source='codex-imagegen', added='2026-10-24'))
        x,y = index%2*800,index//2*490
        preview.paste(image.resize((800,450)),(x,y))
        draw.text((x+10,y+460),id,fill='#e9c685')
        report.append(dict(id=id, bytes=target.stat().st_size, quality=quality, dimensions=[1600,900]))
    path.write_text(json.dumps(catalog,indent=2)+'\n')
    preview.save(REPO/'docs/art/library-batch-2-scenes.jpg',quality=88)
    (HERE/'scene-export-report.json').write_text(json.dumps(report,indent=2)+'\n')
    print(f'Exported and validated {len(report)} scenes; highest size {max(r["bytes"] for r in report)} bytes')

if __name__ == '__main__':
    main()
