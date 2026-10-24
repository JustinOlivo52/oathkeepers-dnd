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

## Checkpoint 4 — finish all forty spell icons (2026-10-24)

Continues the same branch and PR #4. Exports the final six icons from the saved
`icons-1.png`: Fireball, Lightning Bolt, Mass Healing Word, Revivify, Spirit Guardians,
and Vampiric Touch. No artwork regenerated. All previous 34 image hashes unchanged.

Run `python3 packages/web/art/codex/completion/export-icons-checkpoint-4.py`.
Uses the shared exporter with source hash/dimension guards and reviewed crop boxes.
Preview/report: `docs/art/spell-icons-checkpoint-4.{png,json}`. All six exports are
64×64 RGBA, under 20 KB each, with transparent edge margins. Preview inspected at
64px and 20px. Catalog icon IDs exactly cover the current forty-spell roster,
without duplicates, missing icons, or extra icons. Live UI acceptance remains pending.
Validation: 270 tests passed, 1 skipped; TypeScript and production build passed
(existing bundle-size advisory). All forty output hashes, bounds, formats and
roster coverage verified.

## Spell animation checkpoint 1 — 20/50 exports

Exported ten damage-type projectile/impact pairs from the existing effects-0
through effects-4 atlases. Uses the preserved effects-1-clean.png for lightning
and acid. No source illustrations regenerated or overwritten.

Reproduce: `python3 packages/web/art/codex/completion/export-vfx.py --batch 1`.
Requires Python, Pillow and numpy. `vfx-source-lock.json` pins source dimensions
and SHA-256 hashes. Projectiles use the four authored middle phases (1,2,3,4),
64px frames at 14 fps; impacts use all eight phases, 192px at 16 fps. Registration
retains a common cell scale/center; alpha cleanup removes nearly invisible noise,
a 14px edge window isolates atlas glows, and one-shot opacity gains give a clear
build/peak/fade. These are processing operations on the saved art.

Independent audit: 20 sheets / 120 distinct frames passed dimensions, hashes,
transparent margins, source identity and one-shot fade checks. Standalone browser
viewer loaded every sheet and visited every frame. Phaser loaded and animated
all 20 sheets without errors; mobile viewer has no horizontal overflow.
This verifies asset playback, not spell routing in actual encounters.
Project checks: 270 tests passed, 1 skipped; TypeScript and production build
passed, with the existing large-bundle advisory.

Artifacts: `spell-effects-export-report.json`, `spell-effects-audit.json`,
`spell-effects.jpg`, `spell-effects.html`, browser light/dark screenshots and
`spell-effects-browser-check.json`, all in `docs/art/`. Source scripts remain in
`packages/web/art/codex/completion/`. Catalog art-ready; integration pending.

## Spell animation checkpoint 2 — 40/50 exports

Added healing, blessing, shielding, restraint, teleport, control, courage, weapon
buff and smite animations, plus all eight planned area effects. The contact-sheet
review found neighbor fragments when assuming an equal generated grid. Corrected
with explicit row/column crop boundaries in `vfx-source-lock.json`; each row uses
a shared canvas scale so different crop widths do not change the animation scale.
No illustrations regenerated. Checkpoint 1 outputs remain unchanged.

Reproduce: `python3 packages/web/art/codex/completion/export-vfx.py --batch 2`.
Audit: `python3 packages/web/art/codex/completion/audit-vfx.py --expected 40`.
All 40 sheets / 280 frames passed the independent audit. The viewer and Phaser
playback checks cover all 40, with dark/light review and no mobile overflow.
Project validation: 270 tests passed, 1 skipped; TypeScript and build passed,
with the existing bundle advisory. Runtime battle integration remains pending.

## Spell animation checkpoint 3 — complete 50/50 exports

Added Lesser Restoration, Revivify, Vampiric Touch, Magic Missile/Eldritch Blast/
Scorching Ray projectiles, Sacred Flame, Guiding Bolt, Spiritual Weapon and Vicious
Mockery. Taller reviewed row boundaries preserve the final atlas's uneven layout.
All previous forty exports remain byte-for-byte unchanged. No artwork regenerated.
A final visual pass also tightened Vampiric Touch crop boundaries to exclude
neighboring purple fragments.

Final inventory: **13 projectile loops, 29 impacts, 8 areas — 50 sheets / 348 frames**.
Final checks: 270 tests passed, 1 skipped; TypeScript and production build passed
(existing bundle advisory). Independent audit: all 348 frames passed; browser
and Phaser playback: 50/50, zero load/page errors and no mobile overflow.

Projectiles: 4×64px at 14 fps. Impacts: 8×192px at 16 fps. Areas: 8×384px at 16 fps.
All use transparent RGBA PNGs and unique `vfx-*` catalog IDs. Source files, selected
phases, crop boxes, opacity gains, output sizes and SHA-256 hashes are recorded.
Catalog entries remain integration-pending; the existing battle art lookup can
load art-ready effects. No game code, spell rules or fallback rendering changed.

Reproduce all fifty (Python 3, Pillow, numpy):

```sh
python3 packages/web/art/codex/completion/export-vfx.py --batch all
python3 packages/web/art/codex/completion/audit-vfx.py --expected 50
```

Or run `--batch 1`, `--batch 2`, `--batch 3` for 20/20/10 subsets. All fifty sheets
were regenerated with the script and reproduced byte-for-byte. The independent
audit validates exact manifest coverage/roles, dimensions, source/output hashes,
unique nonempty frames, transparent margins, buildup/fade and readiness metadata.
All forty icon files remain unchanged and exactly match the forty-spell roster.

Browser review: serve the repository root on localhost:8765, then run:

```sh
PLAYWRIGHT_MODULE=/path/to/playwright node packages/web/art/codex/completion/review-vfx.cjs 50
```

The runner uses Chromium (override `CHROMIUM_PATH` if needed). It verifies every
frame in the standalone viewer, light/dark screenshots, mobile overflow, and a
Phaser texture/frame-count/playback smoke check. All fifty animations loaded and
played, with no image-load or page errors. This is asset playback evidence, not
proof of correct presentation in every live encounter.

## Battle integration review — approved for runtime use

The production battle scene passed 61 deterministic engine-to-renderer scenarios:
all forty real spell definitions, northward/diagonal cones and lines, upcast Magic
Missile, ten reusable damage-type fallbacks, missed attacks and five visual captures.
All fifty animation IDs were exercised. The actual app's spell panel rendered and
loaded all forty icons at their real 20px display size. No paid AI service was used.

Fixed presentation gaps before approval:

- Spell attack logs optionally carry the resolved damage type, so Chromatic Orb's
  art matches the engine's existing target-specific damage choice, including misses.
- Cones and lines rotate toward the aim. Every area effect is masked to exactly
  the engine's affected squares; blocked cells are not painted. Spheres and even
  squares keep their original target alignment when walls clip their area.
- Spirit Guardians has a persistent aura that follows movement and stops on lost
  or replaced concentration. Its ongoing damage gets a radiant hit effect.
- Vampiric Touch is a melee impact with a separate healing cue when healing occurs.
  Melee spells no longer fire generic projectiles. Misses have no damage impact.
- Misty Step fades out, relocates without a walking animation, and fades in.
- Magic Missile's dart count follows slot level. Smites and Divine Favor show their
  impact again on the actual weapon hit, using existing extra-damage events.

Only optional presentation fields were added to battle logs. Existing snapshots
and older events remain compatible. Spell mechanics, costs, damage amounts and
other artwork readiness were not changed. The ninety spell-art entries (40 icons,
50 VFX) are integration-ready after this review; historical checkpoint statements
about pending readiness describe the earlier production handoff.

Evidence: `docs/art/spell-battle-check.json`, `spell-battle-screenshots.json`,
`spell-battle-icons.jpg`, and the directional/aura/healing/missile battle captures.
These use production BattleScene and actual engine casts with deterministic test
creatures; they do not assert every possible player build or multiplayer network
condition has been manually played. Browser review is reproducible with Vite:

```sh
npm run dev -w @oathkeepers/web -- --host 127.0.0.1 --port 5173
PLAYWRIGHT_MODULE=/path/to/playwright node packages/web/art/codex/completion/review-battle-spells.cjs
```

Project validation: 277 tests passed, 1 skipped; TypeScript and production build
passed (existing large-bundle advisory). The source/output audit still covers all
348 frames and can require integration-ready metadata:

```sh
python3 packages/web/art/codex/completion/audit-vfx.py --expected 50 --require-integrated
```

## Resume here

**40/40 icons and 50/50 spell animations are produced, reviewed and integrated.**
Do not regenerate these collections. Sources, exporters, manifests, checkpoint
reports and screenshots remain preserved. PR #4 carries the complete delivery.
Other character/monster/environment integration and the forest/cave/crypt props
renderer wiring remain separate follow-up work. Check actual assets before
following older artwork checklists.
