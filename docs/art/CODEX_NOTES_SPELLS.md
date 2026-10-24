# Spell artwork checkpoints

## Checkpoint 1 — four spell icons (2026-10-24)

Branch: `art/spell-icons-checkpoint-1`, based on master `1636d3c`.

Exported from the existing `packages/web/art/codex/source/completion/icons-0.png`:

- `icon-fire-bolt`
- `icon-ray-of-frost`
- `icon-shocking-grasp`
- `icon-acid-splash`

All four PNGs are 64×64 RGBA with clear edge margins and under 10 KB each.
Their catalog entries are art-ready, mechanics not required, integration pending.
The existing battle button lookup selects art-ready icons; no renderer code changed.
The 64px and 20px preview was inspected, but live battle UI acceptance remains pending.
No artwork was regenerated and no existing asset was replaced.

Reproduce from the repository root (Python 3 and Pillow):

```sh
python3 packages/web/art/codex/completion/export-icons-checkpoint-1.py
```

The script checks the source hash and dimensions before using reviewed crop boxes.
It updates these four catalog entries idempotently, writes only this checkpoint's
exports, and emits a preview and JSON report with crop boxes, output sizes and hashes:
`docs/art/spell-icons-checkpoint-1.png` and `docs/art/spell-icons-checkpoint-1.json`.
Do not assume equal grid cells: the saved atlas has uneven gutters and bottom padding.

Validation: source/export bounds, transparency and byte-budget assertions passed;
TypeScript and production build passed (existing large-bundle advisory).
Full test suite: 30 files passed; 270 tests passed, 1 skipped. Tests ran with
network access so the local HTTP server fixtures could bind.

## Checkpoint 2 — ten more spell icons (2026-10-24)

Continues the same branch and PR #4. Exports Chill Touch, Poison Spray, Eldritch
Blast, Sacred Flame, Produce Flame, Vicious Mockery, Magic Missile, Burning Hands,
Thunderwave and Guiding Bolt from the same saved atlas. No regeneration.

Run `python3 packages/web/art/codex/completion/export-icons-checkpoint-2.py`.
The guarded checkpoint 1 exporter now accepts a batch and checkpoint number;
its original four-icon command and outputs remain unchanged. Checkpoint 2 writes
its own 64px/20px preview and per-file hash/crop report in `docs/art/`.
All ten exports are 64×64 RGBA, under 10 KB each, with transparent edge margins.
Preview inspected at 64px and 20px. Integration remains pending live UI review.
Validation: 270 tests passed, 1 skipped; TypeScript and production build passed
(existing bundle-size advisory). All checkpoint 1 image hashes remain unchanged.

## Checkpoint 3 — twenty more spell icons (2026-10-24)

Continues the same branch and PR #4. Exports the next twenty manifest entries:
Inflict Wounds, Cure Wounds, Healing Word, Bless, Shield of Faith, Scorching Ray,
Shatter, Hold Person, Misty Step, Spiritual Weapon, Chromatic Orb, Entangle,
Command, Heroism, Divine Favor, Thunderous Smite, Searing Smite, Wrathful Smite,
Aid and Lesser Restoration. Six come from `icons-0.png`, fourteen from `icons-1.png`.
No artwork was regenerated or replaced.

Run `python3 packages/web/art/codex/completion/export-icons-checkpoint-3.py`.
Both saved atlases are validated against their reviewed dimensions and SHA-256
hashes before writing exports. Each report entry identifies its source atlas,
crop box, output hash, size and byte count. All twenty icons are 64×64 RGBA with
transparent edge margins and under 20 KB. Preview inspected at 64px and 20px.
All fourteen previous icon output hashes remain unchanged. Live UI review remains
pending. Preview/report: `docs/art/spell-icons-checkpoint-3.{png,json}`.
Validation: 270 tests passed, 1 skipped; TypeScript and production build passed
(existing bundle-size advisory). Bounds, RGBA format, output hashes and catalog
uniqueness verified across all 34 icons.

## Resume here

Batch size: **20 at a time**, or the remaining count if fewer than twenty.
Current total: **34/40 icons exported; 0/50 VFX sheets exported**.

Six icons remain, all in the saved `icons-1.png` atlas:

- Fireball
- Lightning Bolt
- Mass Healing Word
- Revivify
- Spirit Guardians
- Vampiric Touch

Review their actual crop boxes before exporting. All icon and VFX sources are
already saved: do not regenerate them. Keep every checkpoint's preview and report.

After icons, export the 50 effect definitions from the 13 saved `effects-*.png`
atlases with the required projectile/impact/area sizes and frame counts. Review
each subset in the real UI before promoting integration readiness. Leave all
other artwork, monster rules and archived alternatives intact.
