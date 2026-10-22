# Art library pilot — Codex handoff

Branch: `art/library-batch-1` from current master. The owner approved policy fixes and the representative pilot in `CODEX_BRIEF_LIBRARY_1.md` rather than producing the entire original78-deliverable brief at once.

## Infrastructure

- Independent art/mechanics/integration readiness gates. Pending monster art may exist before its stat block; shipped encounters cannot select it by default.
- Exact identity, mandatory location/setting/time/species/creature constraints, optional extra required tags, preference ranking, then repetition avoidance. Unknown/unmatched tags yield no result rather than unrelated art.
- Rules-size/footprint/anchor metadata separate from drawing canvas. Runtime default1x1 capability excludes larger sprites; no Large creature mechanics were added.
- Board validation for connectivity using engine diagonal rules, distinct separated spawns, props bounds and optional2x2 spawn/routes. These are content checks, not combat-system changes.
- Tests cover art-before-mechanics, runtime gating, compatibility selection, repetition regressions, real sheet dimensions, disconnected maps, overlapping spawns and narrow Large routes.

## Production

Pilot assets and preview are being produced on this branch. New entries remain integration-pending until Claude connects them and performs actual gameplay review. Mechanics remain pending for all five new monsters. Further production/validation details will be appended before final delivery.

## Completed pilot

Seventeen catalog entries:5monster sheets (skeleton,zombie,wolf,giant-spider,ogre),5matching monster portraits,3NPC portraits (dwarf innkeeper,human guard captain,gnome merchant),2scene backdrops (forest road and The Lantern),1forest tileset and1forest-road board. Monster sprites contain55frames; medium canvases192px, Large canvases384px. Eight portraits512x512 are under150KB each; both scenes1600x900 are under400KB.

Source illustrations and per-asset crop/registration/export scripts live in `packages/web/art/codex/{source/library1,library1}`. Rebuild all pilot exports and review files with:

```
python3 packages/web/art/codex/library1/build-library.py
```

Requires Python3 and Pillow. It does not regenerate illustrations or call a paid API. It validates dimensions, transparency, all55nonempty unclipped frames, image byte budgets and the17-entry inventory.

Review files:
- `docs/art/library-batch-1.png`: all frames, portraits, scenes and board contact sheet.
- `docs/art/library-batch-1.html`: interactive asset-review viewer. Serve the repository root with a local HTTP server; choose idle/walk/attack/hit/down, pause/step and mirror facing.
- `docs/art/library-batch-1-browser.png`: captured review page.
- `docs/art/library-batch-1-browser-check.json`: actual Chromium checks.

The viewer is intentionally separate from game controls. Browser review of a sprite gallery is not proof of correct combat implementation. No new monster is added to the bestiary, no gameplay action is enabled and no pending catalog entry becomes encounter-ready. Existing hero/goblin art and battle behavior remain intact.

## Quality and scope limitations

- Right-facing art is mirrored for left-facing; no north/south sheets.
- Each creature has one attack sequence and compact walking poses. This is the baseline library, not final weapon-by-weapon choreography.
- Spider far-side legs overlap in some poses. Ogre club is occluded in two walking poses, and slam/recovery could be more distinct. These remain motion-polish follow-ups before promoting gameplay integration.
- The forest scene uses WebPquality65 to meet the400KB cap; the tavern and portraits use85. Tavern conveys a prepared evening venue without foreground patrons.
- Forest tiles are reviewed for tactical clarity; their edge patterns are not mathematically seamless.
- The forest board declares optional2x2 geometry and alternate Large spawn slots. This is not an implementation of Large occupancy, reach, targeting or tactics. Mixed-size spawn allocation still belongs in the rules/runtime integration.
- Catalog selection is a tested library function. DM art-tool wiring, stable NPC image IDs in saves and runtime loading of these assets remain Claude's integration tasks.
- Layered/custom player-character art is still a separate project; this pilot leaves the four generic hero sheets unchanged.

## Next steps for Claude

Implement and test the five exact SRD creature stat blocks and their abilities; add grid/renderer support before enabling Large creatures. Map art to actual actions rather than playing a bite animation for every ability. Load the catalog's tileset/board paths, preserve selected art IDs in adventures, and use the new strict matching API. Perform real playthroughs, then promote mechanicsStatus/integrationStatus per asset with evidence. Do not mark the whole batch ready based on export success.

The original18-monster/78-deliverable brief remains expansion backlog. This representative pilot completes the smaller scope authorized by the owner.

## Validation evidence

- `npm install` succeeded (writable npm cache).
- All125tests, TypeScript and production build passed; the existing Phaser bundle-size advisory remains.
- Rebuilt all pilot exports and validated55frames and image budgets.
- Chromium asset-review checks passed at desktop1440x1000 and mobile390x844:16images, all5sprites, attack/walk/down playback, mirrored facing, pause/step, board rendering, no page errors and no mobile document overflow.
- Forest atlas was revised once after board-scale review found insufficient wall/difficult-terrain contrast. Original attempt is preserved; final tile separates open earth, central tree/canopy obstacle and pale tangled branches.
- Browser evidence covers the standalone asset viewer, not combat encounters. All17new entries retain integrationStatus pending and all5new monsters mechanicsStatus pending.

To repeat browser evidence, serve the repository root on port4173 and run `packages/web/art/codex/library1/browser-review.cjs` with Playwright available in Node's module path. `ART_REVIEW_URL` overrides the viewer URL and `CHROMIUM_PATH` can select a system Chromium. Playwright is a review-tool dependency, not a game runtime dependency.

## Pilot measurements

Agents recorded17image-generation calls:5monster atlases,5monster portraits,3NPC portraits,2scenes and2forest-atlas attempts. The first forest atlas was replaced after board-scale review. This measures candidate-art production only; paid API cost and end-to-end encounter-ready hours were not logged. Do not project a full-bestiary release date from these candidate generation times. Mechanics/in-game animation review remains the substantial unmeasured part.
