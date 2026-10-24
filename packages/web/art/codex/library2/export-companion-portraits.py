"""Rebuild the five companion portraits from the preserved 2x3 source atlas."""
from pathlib import Path
import json
from PIL import Image, ImageOps

REPO = Path(__file__).resolve().parents[5]
SOURCE = REPO / 'packages/web/art/codex/source/library2/companion-portraits.png'
ASSETS = REPO / 'packages/web/public/assets'
SPECS = [
    ('wren-ashdown', 'Wren Ashdown', ['halfling', 'woman', 'hero', 'expert', 'skirmisher']),
    ('brother-odric-vale', 'Brother Odric Vale', ['dwarf', 'man', 'hero', 'divine', 'leader']),
    ('tamsin-reed', 'Tamsin Reed', ['elf', 'woman', 'hero', 'expert', 'archer']),
    ('sister-maren-holt', 'Sister Maren Holt', ['human', 'woman', 'hero', 'divine', 'healer']),
    ('pip-thistlewick', 'Pip Thistlewick', ['gnome', 'man', 'hero', 'arcane', 'caster']),
]

def main():
    atlas = Image.open(SOURCE).convert('RGB')
    catalog_path = REPO / 'packages/content/data/art-catalog.json'
    catalog = json.loads(catalog_path.read_text())
    ids = {f'portrait-{name}' for name, _, _ in SPECS}
    catalog = [e for e in catalog if e['id'] not in ids]
    for i, (name, title, tags) in enumerate(SPECS):
        x, y = i % 2, i // 2
        bounds = (round(x*atlas.width/2), round(y*atlas.height/3),
                  round((x+1)*atlas.width/2), round((y+1)*atlas.height/3))
        portrait = ImageOps.fit(atlas.crop(bounds), (512, 512), method=Image.Resampling.LANCZOS)
        relative = f'library/portraits/companion-{name}.webp'
        path = ASSETS / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        portrait.save(path, 'WEBP', quality=85, method=6)
        assert path.stat().st_size < 150000, path
        catalog.append(dict(id=f'portrait-{name}', kind='npc', title=f'{title} portrait',
                            tags=tags, image=relative, source='codex-imagegen', added='2026-10-24',
                            artStatus='ready', mechanicsStatus='not-required', integrationStatus='pending'))
    catalog_path.write_text(json.dumps(catalog, indent=2)+'\n')
    print('Exported five 512x512 companion portraits at quality 85, each under 150 KB')

if __name__ == '__main__': main()
