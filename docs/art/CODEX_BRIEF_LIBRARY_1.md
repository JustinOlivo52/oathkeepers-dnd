# Codex Brief: Art Library, Batch 1

You are adding the first batch of the **Oathkeepers art library**: premade art the AI Dungeon Master picks from by tags during play. Read [`LIBRARY.md`](LIBRARY.md) first. It defines the folders, formats, sizes, catalog fields, the allowed tags, and the content rules. This brief lists what to make.

## Active scope: representative pilot first

The owner approved a smaller complete pilot and the policy fixes in `LIBRARY.md` before the original full batch. The rest of this document is the expansion backlog; its original all-assets checklist does not define pilot completion.

Pilot deliverables:
- Five monster sheets and matching portraits: skeleton, zombie, wolf, giant-spider, ogre.
- Three NPC portraits: npc-innkeeper-dwarf, npc-guard-captain, npc-merchant.
- Two scenes: scene-forest-road-day, scene-tavern-night.
- One forest tileset and board-forest-road, with validated spawn/routes.
- Preserved originals, reproducible processing, contact-sheet preview, review viewer and handoff notes.

Add each with explicit readiness fields. Static art inspection may mark art ready. New monster mechanics and runtime integration stay pending. Do NOT add invented/minimal stat blocks merely to pass catalog tests. Large artwork does not authorize Large combat support. Normal runtime selection must not choose pending entries.

The owner also authorized catalog, matching and board-validator changes despite the original art-only instruction below. Engine rules and existing stat blocks remain unchanged.

## How to work

1. Pull the latest `master`, then create the branch **`art/library-batch-1`**.
2. Make the assets in the existing Codex style (see `docs/art/art-trial-codex.png`): detailed 2D fantasy, dark outlines, warm torchlit palette.
3. Keep your raw generated images and processing scripts in `packages/web/art/codex/`, as before.
4. Add a catalog entry for every asset to `packages/content/data/art-catalog.json`.
5. Before you hand off, run all four checks and make sure they pass: `npm install`, `npm test`, `npm run typecheck`, `npm run build`. `npm test` fails if a catalog entry points at a missing file or uses a tag outside the vocabulary.
6. Commit and **push the branch**. Last time the work didn't reach GitHub until it was pushed by hand.
7. Write `docs/art/CODEX_NOTES_LIBRARY_1.md`: what you made, how, anything skipped, and anything that needs review.

Work in the order below and push after each section. If you run out of time, a finished smaller set is better than everything half done.

**Don't change** the rules engine, the content stat blocks, or the game code. Claude adds the monster stat blocks and hooks the art into the game after review.

## 1. Monster battle sprites (highest priority)

Each one: an 11-frame sprite sheet at `assets/sprites/monster-<id>.png`, plus a 512x512 portrait at `assets/library/portraits/monster-<id>.webp` listed as a separate `npc` entry with id `portrait-<id>`.

All are SRD 5.2 creatures. Each sheet's catalog entry uses `kind: "monster"` and `monsterId: "<id>"`. Claude will add the matching stat blocks.

| id | Monster | Size | Tags (use these) | Notes |
|---|---|---|---|---|
| goblin-boss | Goblin Boss | Small (192px canvas) | goblinoid, humanoid, leader | Bigger, better armor than the goblin warrior; crude crown or trophy |
| bugbear-warrior | Bugbear Warrior | Medium | goblinoid, humanoid, brute | Hulking, long arms, morningstar |
| bandit | Bandit | Medium | humanoid, bandit, skirmisher | Hooded, light armor, scimitar |
| bandit-captain | Bandit Captain | Medium | humanoid, bandit, leader | Long coat, two blades |
| cultist | Cultist | Medium | humanoid, cultist, caster | Dark robes, ritual dagger, no real-world religious symbols |
| skeleton | Skeleton | Medium | undead, minion | Rusted shortsword, shield fragment |
| zombie | Zombie | Medium | undead, brute | Shambling; keep it grim, not gory |
| ghoul | Ghoul | Medium | undead, skirmisher | Gaunt, long claws |
| wight | Wight | Medium | undead, leader | Corroded armor, cold glowing eyes |
| wolf | Wolf | Medium | beast, skirmisher | Grey wolf, side view |
| giant-rat | Giant Rat | Small (192px canvas) | beast, minion, skirmisher | Scale it small inside the 192 frame |
| harpy | Harpy | Medium | monstrosity, skirmisher | Wings and talons; tasteful design |
| dire-wolf | Dire Wolf | **Large** | beast, brute | Huge, dark fur |
| worg | Worg | **Large** | beast, monstrosity, brute | Evil-eyed, matted fur |
| giant-spider | Giant Spider | **Large** | beast, eerie | Hairy, readable leg pose in every frame |
| brown-bear | Brown Bear | **Large** | beast, brute | |
| owlbear | Owlbear | **Large** | monstrosity, brute | Original design: owl head and beak on a bear body |
| ogre | Ogre | **Large** | giant, brute | Club, crude hides |

For animals, "attack" is a bite or claw lunge; "walk" is a four-legged gait. Large sheets are 384x384 frames with feet at (192, 340).

## 2. NPC portraits

512x512 WebP at `assets/library/portraits/<id>.webp`, catalog `kind: "npc"`. Chest-up, three-quarter view, a simple painted background that fits the role. Mix species and genders as listed; give each a distinct face.

| id | Who | Tags |
|---|---|---|
| npc-innkeeper-dwarf | Cheerful dwarf innkeeper | innkeeper, dwarf, woman, friendly, tavern, indoor |
| npc-innkeeper-human | Weary human innkeeper | innkeeper, human, man, neutral, tavern, indoor |
| npc-guard-captain | Scarred guard captain | captain, guard, soldier, human, woman, neutral |
| npc-town-guard | Young town guard | guard, soldier, halfling, man, friendly, gate |
| npc-merchant | Shrewd traveling merchant | merchant, gnome, man, neutral, market |
| npc-blacksmith | Frontier blacksmith | smith, goliath, woman, friendly, smithy |
| npc-priest | Kindly temple priest | priest, healer, human, man, friendly, temple |
| npc-priestess-dark | Severe priestess with secrets | priest, elf, woman, sinister, temple |
| npc-noble | Frontier lord | noble, human, man, neutral |
| npc-farmer | Worried farmer | farmer, human, woman, friendly, farm |
| npc-scholar | Absent-minded scholar | scholar, mage, gnome, woman, friendly |
| npc-hunter | Grizzled hunter and tracker | hunter, elf, man, neutral, forest |
| npc-thief | Charming pickpocket | thief, tiefling, woman, neutral, town |
| npc-bard | Traveling orc bard | bard, orc, man, friendly, tavern |
| npc-elder | Village elder | elder, halfling, woman, friendly, town |
| npc-child | Curious street child | child, human, androgynous, friendly, town |
| npc-mage | Mysterious hedge wizard | mage, dragonborn, man, sinister |
| npc-soldier-veteran | One-armed veteran soldier | soldier, dwarf, man, friendly |
| npc-cult-leader | Cult leader (villain) | cultist, villain, human, woman, sinister |
| npc-bandit-leader | Bandit chief (villain) | bandit, villain, orc, man, hostile |

## 3. Scene backdrops

1600x900 WebP at `assets/library/scenes/<id>.webp`, catalog `kind: "scene"`. Wide establishing shots with no characters in the foreground, so they work behind any party. These are the Western Marches frontier: a timber-and-stone frontier town called **Thornwatch**, wild lands around it, old ruins.

| id | Scene | Tags |
|---|---|---|
| scene-thornwatch-gate-day | Thornwatch's palisade gate, morning | town, gate, day, clear, outdoor, calm |
| scene-thornwatch-square | Muddy town square with market stalls | town, market, day, outdoor, festive |
| scene-tavern-night | The Lantern tavern, busy evening | tavern, town, night, indoor, festive |
| scene-tavern-quiet | The Lantern tavern, empty and dim | tavern, town, night, indoor, calm |
| scene-temple | Small frontier temple interior | temple, town, day, indoor, calm |
| scene-smithy | Blacksmith's forge | smithy, town, day, indoor, calm |
| scene-forest-road-day | Forest road through tall pines | road, forest, day, outdoor, calm |
| scene-forest-night | Deep forest at night, moonlight | forest, night, fog, outdoor, eerie |
| scene-river-crossing | Old stone bridge over a river | river, road, dusk, outdoor, calm |
| scene-farmstead | Abandoned farmstead, broken fences | farm, day, rain, outdoor, somber |
| scene-goblin-camp | Goblin camp in a ravine | camp, hills, dusk, outdoor, hostile |
| scene-abbey-exterior | Ruined abbey on a hill | abbey, ruins, hills, dusk, outdoor, eerie |
| scene-cave-entrance | Cave mouth in a rocky hillside | cave, hills, day, outdoor, tense |
| scene-cave-depths | Deep cave with a still pool | cave, underground, eerie |
| scene-crypt | Burial vaults with stone coffins | crypt, underground, eerie |
| scene-watchtower | Lonely watchtower on the frontier | watchtower, hills, dusk, storm, outdoor, tense |

## 4. Battle tilesets and boards

Three new tilesets and one board for each. Tilesets: `assets/sprites/tiles-<id>.png`, 5 frames of 128x128 (floor x3, wall, difficult terrain), catalog `kind: "tileset"` with `tiles` set to the PNG path. Optional props sheet `assets/sprites/props-<id>.png` (2x2 grid of 128x128) for decorations.

Boards: `assets/boards/<id>.json` following the board format in `LIBRARY.md`, catalog `kind: "board"` with `board` set to the JSON path and `tiles` set to the tileset id.

| Tileset id | Look | Board id | Board idea | Board tags |
|---|---|---|---|---|
| tiles-forest | Forest floor, tree trunks as walls, brambles as difficult terrain | board-forest-road | A road through woods with tree clusters for cover | forest, road, outdoor |
| tiles-cave | Cave floor, rock walls, loose scree as difficult terrain | board-cave | Winding cave chambers with a narrow choke point | cave, underground |
| tiles-crypt | Flagstones, carved walls, broken coffins as difficult terrain | board-crypt | Burial halls with pillars and alcoves | crypt, dungeon, underground |

The abbey board stays as it is (Claude will convert it to this format).

## Expansion backlog done means

- [ ] Every asset in sections 1 to 4 exists at the path given, at the size given, with a catalog entry using the listed tags
- [ ] Large monster sheets are 384x384 frames
- [ ] Preview image `docs/art/library-batch-1.png` shows every monster sheet, a grid of all portraits and scenes, and the three boards
- [ ] `npm test`, `npm run typecheck` and `npm run build` pass
- [ ] Branch `art/library-batch-1` is pushed to GitHub
- [ ] `docs/art/CODEX_NOTES_LIBRARY_1.md` written
