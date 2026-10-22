# Codex Brief: Art Library, Batch 2

Batch 1 (the pilot) is merged, hooked into the game and playtested. Batch 2 is the rest of the original list: the expansion backlog in [`CODEX_BRIEF_LIBRARY_1.md`](CODEX_BRIEF_LIBRARY_1.md). Follow [`LIBRARY.md`](LIBRARY.md) for folders, formats, sizes, tags, readiness fields and content rules, and match the style of batch 1.

**Branch:** `art/library-batch-2`, from the latest `master`. If you're also working on [`CODEX_FIXES_LIBRARY_1.md`](CODEX_FIXES_LIBRARY_1.md), keep that on its own branch.

## How to work

1. Work in the section order below and **push after each section.** A finished smaller set beats everything half done.
2. Tags, sizes and notes for every asset are in the batch 1 brief tables. Use those exact ids and tags.
3. Readiness fields for every new entry:
   - Monsters: `artStatus: "ready"` once reviewed, `mechanicsStatus: "pending"`, `integrationStatus: "pending"`. Claude adds the stat blocks and flips them after playtesting.
   - Portraits, scenes, tilesets, boards: `artStatus: "ready"`, `mechanicsStatus: "not-required"`, `integrationStatus: "pending"`.
4. After adding battle sprites, run `python3 packages/web/art/measure-sprites.py` to fill in `visibleHeight`.
5. Don't change game code, the rules engine or stat blocks. Don't add stat blocks.
6. Before handing off: `npm install`, `npm test`, `npm run typecheck`, `npm run build` all pass, and the branch is pushed.

## 1. Monsters (13)

Each one: an 11-frame battle sheet `assets/sprites/monster-<id>.png` plus a 512x512 portrait `assets/library/portraits/monster-<id>.webp` (catalog id `portrait-<id>`).

| id | Size | Notes |
|---|---|---|
| goblin-boss | Medium | Should read as a stronger version of the existing goblin warrior |
| bugbear-warrior | Medium | |
| bandit | Medium | |
| bandit-captain | Medium | |
| cultist | Medium | |
| ghoul | Medium | |
| wight | Medium | |
| giant-rat | Medium | Small in the frame |
| harpy | Medium | |
| dire-wolf | **Large** | Must look clearly bigger than the batch 1 wolf |
| worg | **Large** | |
| brown-bear | **Large** | |
| owlbear | **Large** | Original design |

Large sheets: 384x384 frames, feet at (192, 340), `rulesSize: "large"`, `footprint` 2x2, same pixel density as batch 1.

Order within the section: goblin-boss, bandit, bandit-captain, cultist, bugbear-warrior first. These fill the humanoid enemies the story needs most.

## 2. NPC portraits (17)

512x512 WebP in `assets/library/portraits/`. Batch 1 already made `npc-innkeeper-dwarf`, `npc-guard-captain` and `npc-merchant`. Make the other 17 from the batch 1 table:

`npc-innkeeper-human`, `npc-town-guard`, `npc-blacksmith`, `npc-priest`, `npc-priestess-dark`, `npc-noble`, `npc-farmer`, `npc-scholar`, `npc-hunter`, `npc-thief`, `npc-bard`, `npc-elder`, `npc-child`, `npc-mage`, `npc-soldier-veteran`, `npc-cult-leader`, `npc-bandit-leader`.

## 3. Scene backdrops (14)

1600x900 WebP in `assets/library/scenes/`. Batch 1 already made `scene-forest-road-day` and `scene-tavern-night`. Make the other 14 from the batch 1 table:

`scene-thornwatch-gate-day`, `scene-thornwatch-square`, `scene-tavern-quiet`, `scene-temple`, `scene-smithy`, `scene-forest-night`, `scene-river-crossing`, `scene-farmstead`, `scene-goblin-camp`, `scene-abbey-exterior`, `scene-cave-entrance`, `scene-cave-depths`, `scene-crypt`, `scene-watchtower`.

Thornwatch should look like the same town in every scene: timber palisade, a squat stone keep, muddy streets.

## 4. Tilesets and boards (2 of each)

From the batch 1 table: `tiles-cave` with `board-cave`, and `tiles-crypt` with `board-crypt`.

Apply the lessons from the batch 1 fixes:
- No dark outlines on floor tiles; texture runs to the edges so the board reads as continuous ground
- A props sheet per tileset (`props-cave.png`, `props-crypt.png`, 2x2 grid of 128x128) and some props on each board
- Each board supports 2x2 creatures (`supportedFootprints` with large spawns), since the bestiary now has Large monsters

## Done means

- [ ] All four sections done, or a clearly stated subset, with catalog entries using the listed ids and tags
- [ ] Readiness fields set as above
- [ ] `measure-sprites.py` run after adding sprites
- [ ] Preview `docs/art/library-batch-2.png` with every new asset
- [ ] `npm test`, `npm run typecheck`, `npm run build` pass
- [ ] Branch `art/library-batch-2` pushed
- [ ] Notes in `docs/art/CODEX_NOTES_LIBRARY_2.md`: what was made, how, what was skipped, what needs review
