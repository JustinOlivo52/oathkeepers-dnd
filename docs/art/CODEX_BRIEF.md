# Art Trial Brief for Codex

You are redoing the **pixel artwork** for Oathkeepers, a browser D&D 5e (2024 rules) tactics game. Claude already made a first version. The goal is to see what you can produce so the owner can compare the two and pick an art source.

**Work on a separate branch** (`art/codex-trial`), not `master`, so both versions can be compared side by side.

## What exists now

- Grid battle screen in Phaser 3 (`packages/web/src/battle/`)
- Claude's sprites, drawn as text in `packages/web/art/sprites.ts` and exported by `packages/web/scripts/export-sprites.ts`
- Exported sheets in `packages/web/public/assets/sprites/`
- Preview of Claude's version: `docs/art/art-trial.png`
- Format notes: `docs/art/README.md`

## What to make

The same set of sheets, with the same names, so the game loads them with **no code changes**.

| Sheet | Contents |
|---|---|
| `hero-martial.png` | Armored hero, red accents (Fighter, Barbarian, Monk) |
| `hero-expert.png` | Same hero, green accents (Rogue, Ranger, Bard, Druid) |
| `hero-arcane.png` | Same hero, blue accents (Wizard, Sorcerer, Warlock) |
| `hero-divine.png` | Same hero, gold accents (Cleric, Paladin) |
| `goblin.png` | Goblin warrior with a scimitar |
| `tiles.png` | Dungeon floor (3 variants), wall, rubble (difficult terrain) |

Optional, if you have time: distinct hero silhouettes per group (for example a robe and staff for arcane, a hood for expert) instead of only a color swap.

### Animation frames (characters)

Frames laid out left to right in one row. Characters **face right**.

| Index | Frame |
|---|---|
| 0-1 | idle (breathing) |
| 2-5 | walk cycle |
| 6-8 | attack: wind up, swing, follow through |
| 9 | hit (recoil) |
| 10 | down (lying on the ground) |

### Tiles

`tiles.png` frames: 0-2 floor variants, 3 wall, 4 rubble. Floors must tile seamlessly next to each other.

## Technical rules

- **Frame size:** 16x16 is what the game uses now. You may use 32x32 if it looks clearly better: update `frameWidth` and `frameHeight` in `sprites.json`, and change `ART_SCALE` in `packages/web/src/battle/scene.ts` from `TILE / 16` to `TILE / 32`. That is the only code change allowed.
- **Format:** PNG with transparency. No anti-aliasing, hard pixel edges.
- **Manifest:** keep `packages/web/public/assets/sprites/sprites.json` valid. Sheet names, animation names (`idle`, `walk`, `attack`, `hit`, `down`) and the tiles `named` entry must stay the same.
- **Readability:** sprites are drawn at 48 px per grid square on a dark dungeon floor. They must read clearly at that size, including the weapon.
- **Style:** classic fantasy, high adventure tone. Limited palette, dark outlines.
- **Licensing:** original work only. No copying or tracing existing sprites, games or asset packs, and nothing based on official D&D artwork.
- **Do not change** the rules engine, content data, or battle logic.

## Deliverables

1. The six PNG sheets and an updated `sprites.json` in `packages/web/public/assets/sprites/`
2. A preview image at `docs/art/art-trial-codex.png` with every frame of every sheet, scaled up, in the same layout as `docs/art/art-trial.png`
3. A short note in `docs/art/CODEX_NOTES.md`: how you made the art (code, image generation, or by hand), the frame size, and anything you'd improve with more time
4. Checks pass: `npm install`, `npm test`, `npm run typecheck`, `npm run build`

## How to see it in the game

```sh
npm install
npm run dev
```

Open http://localhost:5173, go to **Battle**, and start a battle. Every hero color can be seen by building characters of different classes in **Character Builder**.

## Comparison scorecard (for the owner)

Rate each 1 to 5 for Claude's version (`master`) and Codex's version (`art/codex-trial`).

| | Claude | Codex |
|---|---|---|
| Readable at game size (can you tell what everything is?) | | |
| Weapon visible during attacks | | |
| Animation smoothness (idle, walk, attack) | | |
| Hero vs goblin clearly different at a glance | | |
| Tiles look good next to each other | | |
| Overall style and appeal | | |
| Followed the format with no code breakage | | |
| **Total** | | |
