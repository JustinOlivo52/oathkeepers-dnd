# Game Art

Current art: **Codex art trial** (chosen over Claude's first pass). Preview: [`art-trial-codex.png`](art-trial-codex.png).
Claude's original 16x16 version is kept for reference in [`art-trial.png`](art-trial.png).

## How it's made

1. Original artwork is generated with an image model (Codex used image generation).
2. The raw images live in `packages/web/art/codex/source/`.
3. Python scripts in `packages/web/art/codex/` crop, clean transparency, line up each frame and pack the sprite sheets. They don't draw anything.
4. Rebuild with `npm run sprites -w @oathkeepers/web` (needs Python 3 and Pillow: `pip install pillow`).

The old text-art exporter is still in `packages/web/scripts/export-legacy-sprites.ts`. Running it overwrites the current sheets with Claude's original art.

## Sheet format

Everything the game loads is in `packages/web/public/assets/sprites/`.

| Sheet | Frames | Size |
|---|---|---|
| `hero-martial.png`, `hero-expert.png`, `hero-arcane.png`, `hero-divine.png`, `goblin.png` | 11, left to right | 192x192, feet at (96, 166) |
| `tiles.png` | floor x3, wall, rubble | 128x128 |
| `props.png` | brazier, column, arch, ivy (2x2 grid) | 128x128 |

Character frames: 0-1 idle, 2-5 walk, 6-8 attack (wind up, swing, follow through), 9 hit, 10 down. Characters face right and are mirrored to face left.

`sprites.json` lists each sheet's frame size and animations. Sheet names and animation names (`idle`, `walk`, `attack`, `hit`, `down`) must stay the same for the game to load new art without code changes.

The battle board draws each square at 96 world pixels (`TILE` in `packages/web/src/battle/scene.ts`).

## Known gaps

- Only left and right facing; no up or down sheets
- One attack animation per hero type; no separate bow, thrown or spell animations
- Every new monster needs its own sheet
- Purely AI-generated images generally can't be copyrighted in the US. Fine for a game among friends; revisit before anything commercial.

## Requesting new art

Use [`CODEX_BRIEF.md`](CODEX_BRIEF.md) as the template: name the sheets, frames, size and style, work on a branch, and have the result tested in the browser before it's merged.
