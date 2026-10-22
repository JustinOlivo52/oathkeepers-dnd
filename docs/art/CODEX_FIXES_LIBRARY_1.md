# Codex Brief: Batch 1 Fixes

Batch 1 (the pilot) is merged, hooked into the game, and playtested in the browser by Claude. These are the fixes found in review. They polish existing assets; nothing new is added.

**Branch:** `art/library-1-fixes`, from the latest `master`.

## Ground rules

- **Keep everything that the game depends on unchanged:** asset ids, file names and paths, frame size, frame count and order, foot anchor, and catalog tags. The game loads these by name.
- **Don't change readiness fields.** All batch 1 entries are now `ready` for art, mechanics and integration. Leave them.
- **Don't change game code,** the rules engine or stat blocks.
- **After changing any battle sprite,** run `python3 packages/web/art/measure-sprites.py`. It updates `visibleHeight` in the catalog, which places health bars above the creature's head.
- Keep the replaced originals and processing scripts in `packages/web/art/codex/`, as before.

## Fixes

Ordered by how much they affect play.

### 1. Forest tileset: visible tile seams (high)

On the board, every square shows a dark frame, so the forest road reads as a checkerboard of separate tiles rather than continuous ground. The game already draws its own faint grid lines, so the art shouldn't carry borders.

- Floor frames 0 to 2: texture should run continuously to the edges, with no dark outline. Neighboring tiles in any combination should look like one surface.
- Keep the three floor variants close in color and value, so random mixing doesn't make a patchwork.
- Wall (frame 3) and difficult terrain (frame 4) should still be instantly readable against the floor, as they are now.
- Check it by viewing `board-forest-road` with all three floor variants mixed (the review viewer is fine).

### 2. Forest board: plain layout (medium)

`board-forest-road` works, but it's mostly open floor with a few tree blocks. It should feel like a road through woods.

- Add a forest props sheet `assets/sprites/props-forest.png` (2x2 grid of 128x128 frames): fallen log, stump, mossy boulder, fern clump. Add it to the `tiles-forest` catalog entry as `props`.
- Add `props` to the board JSON (decorations only, on open or wall squares; they don't change movement).
- Optionally add a few more tree clusters for cover. The board must still pass validation: every open square reachable, spawns open and apart, and the 2x2 routes and large spawns still valid.

### 3. Giant Spider: tangled legs (medium)

In several walk and attack frames, the far-side legs overlap the near-side legs and the silhouette turns into a knot at game size.

- Make the near and far legs read separately: darker or slightly smaller far legs, with fewer crossings.
- Keep the body position and foot anchor the same in every frame.

### 4. Ogre: club hidden, attack frames too similar (low)

- The club disappears behind the body in two walk frames. Keep it visible in all frames.
- Frames 7 (strike) and 8 (follow-through) look almost the same. Make the strike clearly the moment of impact and the follow-through a recovery pose.

### 5. Optional, if time allows

- A slightly longer idle motion for the wolf and zombie (still frames 0 to 1 only).
- The forest road scene used WebP quality 65 to fit the size limit. If you can reach quality 75 or higher under 400 KB, that would help it look sharper.

## Done means

- [ ] Fixes 1 to 4 done, with the same ids, paths and frame layout
- [ ] `python3 packages/web/art/measure-sprites.py` run after the sprite changes
- [ ] Before and after preview at `docs/art/library-1-fixes.png` (forest board mixed tiles, spider and ogre frames)
- [ ] `npm test`, `npm run typecheck` and `npm run build` pass
- [ ] Branch `art/library-1-fixes` pushed to GitHub
- [ ] Notes in `docs/art/CODEX_NOTES_LIBRARY_1_FIXES.md`: what changed and anything still not right
