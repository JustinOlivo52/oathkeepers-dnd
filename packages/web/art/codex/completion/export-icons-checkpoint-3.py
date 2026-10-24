"""Export the next twenty saved spell icons, spanning both original atlases."""
from pathlib import Path
import runpy

HERE = Path(__file__).resolve().parent
ATLAS_1 = HERE.parent / 'source/completion/icons-1.png'
ATLAS_1_SHA256 = '7875e546065ec6aae320679229f84effe3c54ed3f212508a75a50db4ae626a6b'
ITEMS = [
    ('inflict-wounds', 'Inflict Wounds', (570, 792, 821, 1043)),
    ('cure-wounds', 'Cure Wounds', (844, 792, 1093, 1043)),
    ('healing-word', 'Healing Word', (31, 1056, 279, 1312)),
    ('bless', 'Bless', (303, 1056, 551, 1313)),
    ('shield-of-faith', 'Shield of Faith', (570, 1056, 822, 1313)),
    ('scorching-ray', 'Scorching Ray', (845, 1057, 1093, 1315)),
    ('shatter', 'Shatter', (34, 9, 286, 255)),
    ('hold-person', 'Hold Person', (303, 9, 553, 255)),
    ('misty-step', 'Misty Step', (571, 9, 820, 255)),
    ('spiritual-weapon', 'Spiritual Weapon', (837, 9, 1088, 255)),
    ('chromatic-orb', 'Chromatic Orb', (34, 270, 285, 515)),
    ('entangle', 'Entangle', (303, 270, 553, 515)),
    ('command', 'Command', (571, 269, 820, 515)),
    ('heroism', 'Heroism', (837, 269, 1088, 515)),
    ('divine-favor', 'Divine Favor', (33, 530, 285, 785)),
    ('thunderous-smite', 'Thunderous Smite', (303, 530, 553, 785)),
    ('searing-smite', 'Searing Smite', (570, 530, 819, 785)),
    ('wrathful-smite', 'Wrathful Smite', (837, 530, 1088, 785)),
    ('aid', 'Aid', (33, 798, 285, 1056)),
    ('lesser-restoration', 'Lesser Restoration', (303, 798, 553, 1056)),
]

if __name__ == '__main__':
    exporter = runpy.run_path(str(HERE / 'export-icons-checkpoint-1.py'))
    overrides = {spell: (ATLAS_1, ATLAS_1_SHA256, (1122, 1402)) for spell, *_ in ITEMS[6:]}
    exporter['main'](items=ITEMS, checkpoint=3, source_overrides=overrides)
