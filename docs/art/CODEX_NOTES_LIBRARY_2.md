# Batch 2 progress — all thirteen monsters

Branch: `art/library-batch-2`, based on master `13e1a89`.

Completed in brief order: goblin-boss, bandit, bandit-captain, cultist, bugbear-warrior.
Each has an eleven-frame 192×192 transparent battle sheet and a matching 512×512 WebP portrait under 150 KB. Ten catalog entries use the exact requested ids/tags. Goblin Boss remains rules-size Small; the atlas format is Medium. All art is reviewed and ready; monster mechanics and all integration remain pending. No game code, engine rules or stat blocks changed.

## Sources and rebuild

Original image-model generations are preserved in `packages/web/art/codex/source/library2/`. The existing goblin source supplied the style reference. Five original sprite atlases and one matching portrait atlas were generated, with no named artists or official artwork references.

`python3 packages/web/art/codex/library2/build-library.py` extracts whole connected poses from source alpha, registers feet, scales each creature consistently, exports sheets/portraits, updates these catalog entries and builds the contact sheet and interactive viewer. It does no illustration. Whole-pose extraction is necessary because generated poses cross the approximate source grid. It asserts eleven isolated substantial pose components, transparent nonempty output frames and clear canvas margins. Registration uses the lower foot pixels; wide strikes may shift horizontally to keep weapons within bounds.

Then run `python3 packages/web/art/measure-sprites.py` to measure visible heights. The first five measure 111, 128, 128, 128 and 135 pixels respectively. No existing catalog entries are intentionally changed by the builder.

Preview: `library-batch-2.png`; browser viewer: `library-batch-2.html`. Serve the repository root over HTTP to use the viewer. It supports all five animations, pause, manual stepping and mirroring. All sheets share a source-pixel scale.

## Verification

- `npm install` completed; lockfile kept unchanged.
- `npm test`: 212 tests passed (19 files).
- `npm run typecheck`: passed.
- `npm run build`: passed; existing bundle-size advisory remains.
- Chromium: all 10 image assets loaded; all 55 frames exercised across idle/walk/attack/hit/down, mirroring and canvas pixels verified; no page errors or asset failures.
- Desktop 1440×1000 and mobile 390×844: no document horizontal overflow.
- Browser screenshot and check results saved alongside this note.

The restricted command sandbox blocked server-test sockets; rerunning with local socket access passed. This was an execution restriction, not a code failure.

## Remaining and limitations

All thirteen required monsters are now exported (143 frames) with thirteen portraits. Added ghoul, wight, giant-rat, harpy, dire-wolf, worg, brown-bear and owlbear on 2026-10-24. The four Large beasts use 384px frames with (192,340) anchors and 2x2 footprints. NPC production is in progress. Full current-master verification will be rerun before final handoff. NPCs, scenes, cave/crypt sets and companions are still pending.

Only left/right facing via mirroring. Four-pose walks are compact and can slide; one melee attack per creature. Captain's offhand blade is partly occluded during strike. Bugbear target idle height is constrained slightly by its wide down pose to preserve a shared scale across frames. Runtime encounter integration and actual battle playthrough are pending and must be reviewed separately once mechanics exist. Nothing is merged to master.
