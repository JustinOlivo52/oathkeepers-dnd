# Phase 3 artwork update — Codex handoff

## Branch and agreed direction

Work is on `art/codex-trial`; master is unchanged. The owner selected the detailed 2D fantasy character style of the Fallen Abbey concept and the spacious tactical presentation of Lanternwood Crossing. The owner explicitly authorized larger art than the original 16x16/32x32 brief.

## Implemented

- Four distinct hero designs: crimson sword/shield fighter, green hooded expert, blue-robed staff caster, gold/ivory mace-and-shield divine hero.
- Detailed goblin warrior with scimitar and buckler.
- Character sheets: 11 horizontal 192x192 RGBA frames; feet registered at (96,166). Visible standing hero height is approximately128px; goblin approximately95px.
- Original animation contract preserved: idle0-1, walk2-5, attack6-8 with return to0, hit9, down10. Attack playback is8fps.
- Terrain: three slate/moss floor variants, raised masonry wall, rubble; five128x128 frames in tiles.png. Transparent props atlas: brazier,column,arch,ivy in a2x2 grid of128px cells.
- Renderer:96 world pixels per5ft square, independent character foot origin, updated depth/HP placement, wheel zoom, Shift/right/middle drag pan, keyboard camera controls, Find hero and Whole map buttons.
- Battle-only dark/brass presentation with initiative art, compact action dock, health meter, collapsible encounter setup and battle journal.
- New authored Abbey ruins encounter board with broad routes, cross-passages, solid columns and difficult terrain. Generated dungeon remains selectable. Rules engine and content data are unchanged.
- Stable battle component key replaces the previous random key.

## Files and rebuilding

Runtime images and manifest: `packages/web/public/assets/sprites/`.
Original generated artwork and registration scripts: `packages/web/art/codex/`.
Contact sheet: `docs/art/art-trial-codex.png`.

Run `npm run sprites -w @oathkeepers/web` to rebuild from preserved generated raster originals. Requires Python3 and Pillow. Scripts crop, clean alpha, resize with nearest-neighbor sampling, register and repack; they do not illustrate sprites. The old text-art exporter is retained as `packages/web/scripts/export-legacy-sprites.ts`. Do not run it over the new runtime sheets unless deliberately restoring Claude's old artwork.

## Validation status and remaining work

Dependency installation succeeded using a writable npm cache. Before integration, the repository baseline passed86 tests, typecheck and production build. The new asset build completed and validated55 nonempty, transparent character frames with no frame-edge clipping, plus5 terrain frames. An intermediate renderer/UI typecheck passed. Final integrated checks and browser playtesting were interrupted before completion; do not treat this branch as browser-verified or production-ready.

Review camera initialization/resizing, movement selection after zoom/pan, attack confirmation and damage/down playback, generated dungeon mode, all four hero appearances, small screens and missing-asset behavior. The local changes need final integrated test/typecheck/build checks and a visual playthrough.

## Known limits

This is a first integrated art pass, not a complete animation library. Art faces right and is mirrored horizontally; north/south directional sheets are not present. Each archetype has one attack sequence; individual weapons, ranged attacks, unarmed attacks and spells do not yet have bespoke animations. Caster art currently accompanies the existing generic attack events. Idle movement is modest. Terrain crack patterns are not mathematically periodic; grout conceals most seams. Minor prop alpha specks may need cleanup. The board is modular generated raster artwork, not the fully painted concept screenshot; compare the actual running game rather than assuming screenshot fidelity. No live deployment was requested or performed.
