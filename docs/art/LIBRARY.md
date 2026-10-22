# Art Library

The game uses a library of **premade, reviewed art**. The AI Dungeon Master never draws anything during play. It asks for art by **tags** ("tavern, night"), and the game picks the best match from the library. Among equally good matches it picks at random, and it avoids repeating recent images.

AI image generation is the backup only: when nothing in the library fits (a unique villain, say), one image is generated, reviewed, and **added to the library** so it gets reused.

## Folder layout

Everything the game loads is in `packages/web/public/assets/`.

```
assets/
  sprites/                      battle sprite sheets (heroes, monsters) and tilesets
    monster-<id>.png
    tiles-<id>.png
    props-<id>.png
  library/
    portraits/<id>.webp         NPC and monster portraits for story scenes
    scenes/<id>.webp            location backdrops
  boards/<id>.json              hand-made battle boards
```

The catalog that lists every asset is `packages/content/data/art-catalog.json`. An image that isn't in the catalog doesn't exist as far as the game is concerned.

## Asset types

| Kind | What it is | Format | Size |
|---|---|---|---|
| `hero` | Player character battle sprite | PNG, transparent | 11 frames of 192x192 in one row |
| `monster` | Monster battle sprite | PNG, transparent | Medium: 11 frames of 192x192. Large: 11 frames of 384x384 |
| `npc` | Portrait shown in the story | WebP, quality about 85 | 512x512, under 150 KB |
| `scene` | Location backdrop shown in the story | WebP, quality about 85 | 1600x900, under 400 KB |
| `tileset` | Terrain tiles for battle boards | PNG | 5 frames of 128x128: floor x3, wall, difficult terrain |
| `board` | A hand-made battle map | JSON (see below) | 18 to 26 squares wide, 12 to 16 tall |

Monsters can also have a portrait (an `npc`-style still image) listed as a separate `npc` entry with the monster's creature tags.

### Battle sprite frames

Frames go left to right in one row. Characters **face right** (the game mirrors them to face left).

| Frames | Animation |
|---|---|
| 0-1 | idle |
| 2-5 | walk |
| 6-8 | attack: wind up, strike, follow through |
| 9 | hit (recoil) |
| 10 | down (lying on the ground) |

- **Medium:** feet at pixel (96, 166) in every frame
- **Large:** feet at pixel (192, 340) in every frame
- Keep the same pixel density across all sprites, so a Large ogre looks twice the size of a Medium goblin
- Nothing may touch the frame edge, and the background must be fully transparent

### Board JSON

```json
{
  "id": "forest-road",
  "name": "Forest Road",
  "tileset": "tiles-forest",
  "rows": [
    "######################",
    "#....~~.......#......#",
    "..."
  ],
  "props": [{ "x": 4, "y": 2, "prop": 0 }],
  "partySpawns": [{ "x": 2, "y": 7 }],
  "enemySpawns": [{ "x": 18, "y": 6 }]
}
```

- `#` wall (blocks movement and sight), `.` floor, `~` difficult terrain (costs double movement)
- At least 6 party spawns and 8 enemy spawns, all on open squares, with enough distance between the groups to matter
- `prop` is a frame number in the tileset's props sheet (decorations only; they don't change the rules)
- Every open square must be reachable from the party spawns

## Catalog entries

```json
{
  "id": "scene-tavern-night",
  "kind": "scene",
  "title": "The Lantern tavern at night",
  "tags": ["tavern", "town", "night", "indoor", "festive"],
  "image": "library/scenes/tavern-night.webp",
  "source": "codex-imagegen",
  "added": "2026-10-22"
}
```

| Field | Used by | Meaning |
|---|---|---|
| `id` | all | Unique, lowercase with dashes |
| `kind` | all | `hero`, `monster`, `npc`, `scene`, `board`, `tileset` |
| `title` | all | Short human description |
| `tags` | all | From the vocabulary below only; 3 to 8 per entry |
| `sprite` | hero, monster | `{ file, frameWidth, frameHeight, size: "medium" or "large" }` |
| `monsterId` | monster | The bestiary id, for example `goblin-warrior` |
| `image` | npc, scene | Path under `assets/` |
| `board` | board | Path to the board JSON |
| `tiles` | tileset, board | Tileset: path to its PNG. Board: the tileset's catalog id |
| `source` | all | `codex-imagegen`, `claude-code`, `commissioned`, or `ai-generated-in-game` |
| `added` | all | Date added, `YYYY-MM-DD` |

## Tag vocabulary

Only these tags are allowed. The tests reject anything else, which keeps matching reliable. To add a tag, add it to `ART_TAGS` in `packages/content/src/art.ts` and to this list.

| Group | Tags |
|---|---|
| place | town, tavern, temple, market, smithy, gate, road, forest, river, farm, ruins, abbey, cave, crypt, camp, hills, mountain, watchtower, dungeon, swamp |
| time | day, night, dusk, dawn |
| weather | clear, rain, fog, snow, storm |
| mood | calm, tense, eerie, hostile, festive, somber |
| setting | indoor, outdoor, underground |
| creature | humanoid, goblinoid, beast, undead, monstrosity, giant, fiend, swarm |
| role | innkeeper, guard, captain, merchant, priest, noble, farmer, smith, scholar, thief, bandit, cultist, hunter, elder, child, soldier, mage, bard, healer, villain, hero |
| species | human, elf, dwarf, halfling, gnome, dragonborn, tiefling, orc, goliath |
| presentation | man, woman, androgynous |
| attitude | friendly, neutral, sinister |
| combat | brute, skirmisher, archer, caster, leader, minion |
| archetype | martial, expert, arcane, divine |

## Rules for all art

- **Original work only.** SRD monsters and ideas are free to use, but official D&D artwork is not. No copying, tracing or imitating book art, and no prompts naming artists or "official D&D style."
- **SRD monsters only.** Nothing from outside the SRD 5.2 (no Beholders, Mind Flayers, Displacer Beasts and so on).
- **One style.** Match the existing Codex art: detailed 2D fantasy, dark outlines, warm torchlit palette, readable at game size.
- **No text or watermarks** in images.
- **Mature but not graphic.** Dark fantasy is fine; no gore close-ups or sexual content.
- **Reviewed before it ships.** New art goes on a branch, passes `npm test` (which checks the catalog), and is looked at in the running game before merging.

## How the game uses it

- **Battles:** monster sprites by `monsterId`; boards by tags (`cave`, `forest`).
- **Story:** the DM calls a tool to show a scene or a character, passing tags. The game shows the best match next to the narration.
- **Code:** `pickArt(catalog, { kind, tags, monsterId, exclude }, rng)` in `packages/content/src/art.ts`.

## Library 1 policy update (2026-10-22)

These rules supersede conflicting examples above. The catalog is a development inventory as well as a runtime library: an asset may exist in the catalog before it is usable in the game.

### Three independent readiness fields

- `artStatus`: `draft` or `ready` (source and exported art inspected).
- `mechanicsStatus`: `pending`, `ready`, or `not-required` (only non-monsters may use `not-required`).
- `integrationStatus`: `pending` or `ready` (runtime mapping and browser playthrough complete).

Missing fields default to draft/pending/pending. `integrationStatus: ready` requires ready art and supported mechanics. `isEncounterReady()` requires all applicable gates. Existing shipped assets have explicit ready values. New pilot assets remain integration-pending; monster mechanics remain pending until Claude implements their exact stat blocks and abilities.

A monster's `monsterId` is required even for art-first work. It must resolve to a bestiary entry when mechanics are marked ready. Pending monster art is allowed without a stat block. Tests must not force placeholder creature rules just to admit artwork.

### Matching and identity

`pickArt()` defaults to encounter-ready assets. Location, setting, time, species and creature tags in `tags` are mandatory constraints; other tags are ranking preferences. `requiredTags` adds further mandatory constraints. Unknown tags or no compatible match return `undefined`; the caller can omit the illustration or choose an explicit narrative fallback, never display unrelated art silently.

Match quality is decided before recent-image avoidance. Repetition avoidance happens only among equally suitable images. Repeating the correct crypt is preferable to a fresh tavern. `assetId` preserves a previously selected identity; save selected asset IDs with adventures/NPCs to prevent appearance changes. The selector supports this pinning but save/UI integration remains Claude's task.

`readiness: art-ready` explicitly enables development review of reviewed but unintegrated assets. Do not expose this option to the DM during normal play.

### Drawing size is not rules size

The legacy `sprite.size` describes the canvas format only. Use independent fields:

```json
{
  "file": "sprites/monster-ogre.png",
  "frameWidth": 384,
  "frameHeight": 384,
  "size": "large",
  "rulesSize": "large",
  "footprint": { "width": 2, "height": 2 },
  "anchor": { "x": 192, "y": 340 }
}
```

Small and Medium creatures normally occupy1x1; Large2x2; Huge3x3; Gargantuan minimum4x4. The existing goblin is rules-size Small despite its192px canvas. Do not scale all creatures from frame width alone or assume every monster has humanoid height. Creature tags describe art matching, not authoritative rules taxonomy. `swarm` means an actual swarm depiction, not a single rat.

A larger atlas does not implement occupancy, reach, movement clearance, targeting or area effects. Runtime `pickArt` allows only1x1 sprites unless the caller explicitly supplies `maxFootprint` after engine/renderer support exists. New Large pilot assets are NOT encounter-ready.

### Board validation

The schema checks rectangular rows, open and distinct party/enemy spawns, at least3 squares of separation between opposing1x1 anchors, in-bounds props and reachability of every open tile using the engine's existing diagonal/corner rules.

Boards default to `supportedFootprints: ["1x1"]`. Declaring2x2 support requires `largePartySpawns` and `largeEnemySpawns`, each anchor having a clear2x2 area; Large slots cannot overlap each other and must connect through a2x2-clear route. Opposing Large anchors must be at least4 squares apart. Large spawn lists are alternative placement layouts; a runtime allocator must still prevent collisions when mixing creature sizes. This validator is asset geometry checking, not an implementation of Large-creature combat.

Board catalog `tiles`, board JSON `tileset`, and the referenced tileset catalog ID must agree. Optional `props` on the tileset entry names its raster props sheet.

### Player artwork

Player appearance needs a separate compatible-body/equipment specification. The four existing hero sheets remain generic defaults. This batch does not implement layered character customization.
