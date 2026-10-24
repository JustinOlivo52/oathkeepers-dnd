# Batch 2 delivery and remaining work

Updated 2026-10-24. Branch: `art/library-batch-2`; audited starting commit `7b8180c` against master `f2b4e59`. The full checklist is in [OATHKEEPERS.md](../OATHKEEPERS.md#artwork-remaining-and-claude-handoff).

## Delivered files

- 13 monster sheets (143 frames) and matching portraits: goblin-boss, bandit, bandit-captain, cultist, bugbear-warrior, ghoul, wight, giant-rat, harpy, dire-wolf, worg, brown-bear, owlbear.
- All 17 remaining NPC portraits and all 14 remaining scene backdrops.
- Cave and crypt: two five-frame tilesets, two four-frame props sheets and two boards declaring Large routes/spawns.
- Five new companion portraits: Wren Ashdown, Brother Odric Vale, Tamsin Reed, Sister Maren Holt and Pip Thistlewick.

The five companion portraits are new artwork from this continuation, generated as a 2x3 atlas. The first five cells hold the named companions in brief order; the sixth is unused. Preserve this source for consistent companion sprite designs. Exports are 512x512 WebP, quality 85, below 150,000 bytes each. Original designs; no official art, artist imitation, logos, text or real-world religious symbols were requested.

## Catalog correction

The incoming catalog had 100 entries, including 16 marked art-ready whose files and generation sources were absent: all companion sheets/portraits and boar, panther and giant-badger sheets/portraits. Removed these broken entries and restored only the five companion portraits after actual generation/export/review. Final catalog: 89 entries, 66 pending additions over master's 23 entries. Props are referenced files, not separate entries.

The five companion sheets and six optional beast files remain to make. No mechanics, game code or existing integrated readiness changed. New monsters retain mechanics pending; all additions retain integration pending.

## Rebuild and evidence

Sources: `packages/web/art/codex/source/library2/`.

- `build-library.py`: rebuilds the 13 monster sets and original monster-only contact sheet/viewer.
- `finish-library.py`: contains NPC, scene and terrain exporters; only NPC export runs by default. Invoke `export_scenes()` / `export_terrain()` explicitly. Its companion/beast exporters require absent sources and are not a production inventory.
- `export-companion-portraits.py`: rebuilds the five new portraits from the preserved atlas without a model call.
- `audit-library.py`: checks all references, pending image sizes/budgets and all pending sprite frames' alpha, bounds and margins; produces `docs/art/library-batch-2-complete.jpg` and `library-batch-2-static-check.json`.

Run these Python scripts from `packages/web/art/codex/library2/` or by their full repo-relative paths; they resolve paths independently of the working directory. The complete static contact sheet includes all pending NPCs, scenes, terrain, boards and companion portraits. The JSON records export dimensions and byte budgets. Static previews were inspected; they do not prove coherent animation or gameplay behavior.

## Review findings and Claude handoff

- Monster silhouettes, portraits and scenes share the established warm, outlined fantasy style. Goblin Boss/Giant Rat remain rules-size Small on 192px canvases; four Large beasts use 384px canvases and 2x2 footprints.
- Compact gaits may slide. Captain's offhand blade is partly occluded during strike. Review actual abilities at battle scale before promoting integration.
- Cave/crypt floors, walls and rubble are distinct. Review adjacent stone joints, floor repetition, props and Large movement in the game. Current renderer loads library tiles without library props; Claude must wire that hook.
- Scene exports fit budgets. Thornwatch's palisade/market palette is consistent at thumbnail scale; review geography at full resolution.
- Bind companion portraits to stable named identities explicitly. The player portrait helper selects kind `portrait`; companion entries use the brief's kind `npc`. Catalog addition alone does not display these in companion panels.
- Forest seams/props, spider leg overlap and ogre club/strike fixes remain on the separate fixes brief/branch.
- Old browser evidence covers the first five monsters only. Extend the viewer and run complete browser/gameplay checks after mechanics/UI integration. This delivery grants no gameplay approval.

## Validation

`npm install --cache /tmp/oathkeepers-npm-cache` succeeded; original lockfile preserved. Project checks: 270 tests passed, one skipped; TypeScript and production build passed. Existing bundle-size advisory remains. Static audit checks all delivered references and 143 expansion sprite frames. Repeat checks after the final portrait export; machine-readable audit contains the final inventory.

Earlier first-five-monster evidence (212 tests and gallery browser checks) remains historical. These notes supersede stale claims that NPCs, scenes and terrain were unproduced.
