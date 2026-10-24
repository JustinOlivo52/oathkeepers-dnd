"""Finish the six remaining spell icons from the saved second atlas."""
from pathlib import Path
import runpy

HERE = Path(__file__).resolve().parent
ATLAS_1 = HERE.parent / 'source/completion/icons-1.png'
ATLAS_1_SHA256 = '7875e546065ec6aae320679229f84effe3c54ed3f212508a75a50db4ae626a6b'
ITEMS = [
    ('fireball', 'Fireball', (570, 798, 819, 1056)),
    ('lightning-bolt', 'Lightning Bolt', (837, 798, 1088, 1056)),
    ('mass-healing-word', 'Mass Healing Word', (33, 1069, 285, 1326)),
    ('revivify', 'Revivify', (303, 1069, 552, 1326)),
    ('spirit-guardians', 'Spirit Guardians', (569, 1070, 819, 1327)),
    ('vampiric-touch', 'Vampiric Touch', (837, 1070, 1088, 1327)),
]

if __name__ == '__main__':
    exporter = runpy.run_path(str(HERE / 'export-icons-checkpoint-1.py'))
    overrides = {spell: (ATLAS_1, ATLAS_1_SHA256, (1122, 1402)) for spell, *_ in ITEMS}
    exporter['main'](items=ITEMS, checkpoint=4, source_overrides=overrides)
