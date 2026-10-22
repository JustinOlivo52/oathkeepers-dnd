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
