"""Export the next ten saved spell icons; reuse checkpoint 1's guarded exporter."""
from pathlib import Path
import runpy

ITEMS = [
    ('chill-touch', 'Chill Touch', (31, 272, 280, 518)),
    ('poison-spray', 'Poison Spray', (303, 272, 551, 519)),
    ('eldritch-blast', 'Eldritch Blast', (570, 272, 821, 518)),
    ('sacred-flame', 'Sacred Flame', (843, 272, 1092, 519)),
    ('produce-flame', 'Produce Flame', (31, 532, 280, 779)),
    ('vicious-mockery', 'Vicious Mockery', (303, 532, 551, 779)),
    ('magic-missile', 'Magic Missile', (570, 532, 821, 779)),
    ('burning-hands', 'Burning Hands', (843, 532, 1093, 779)),
    ('thunderwave', 'Thunderwave', (30, 792, 279, 1043)),
    ('guiding-bolt', 'Guiding Bolt', (303, 792, 551, 1043)),
]

if __name__ == '__main__':
    exporter = runpy.run_path(str(Path(__file__).with_name('export-icons-checkpoint-1.py')))
    exporter['main'](items=ITEMS, checkpoint=2)
