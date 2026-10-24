# Library batch 2 — required artwork complete

Updated 2026-10-24 on `art/library-batch-2`, including the latest master artwork guide.

## Delivered

- 13 monster sheets (143 frames) and 13 matching portraits, previously produced on this branch.
- 17 remaining NPC portraits, previously produced on this branch; the former pending-NPC note was stale.
- 14 new scene backdrops, all 1600×900 WebP and below 400,000 bytes. Quality and byte measurements: `packages/web/art/codex/library2/scene-export-report.json`.
- Five named companion sheets (55 frames) and matching 512px portraits below 150,000 bytes: Wren, Odric, Tamsin, Maren and Pip. Wren/Pip have Small rules metadata and visibly shorter bodies; all sheets keep 192px frames and (96,166) anchors.
- Cave and crypt: two five-frame 128px terrain atlases, two four-frame props atlases and two 22×14 boards. Both boards validate connected ground, separated 6/8 spawns and alternate 2×2 spawns/routes.

This continuation adds 30 runtime files and 28 catalog entries. Total catalog: 94 entries, 71 integration-pending. New entries retain art ready / mechanics not-required / integration pending. Existing monster mechanics remain pending; no stat blocks or game code changed.

## Sources and rebuild

Original image generations are under `packages/web/art/codex/source/library2/{scenes,companions,terrain}`. Nothing was drawn by processing code. The companion portraits were generated using their sprite designs as references. Generations/manifests record source paths and design descriptions. Originals are preserved.

Run from repository root (Python 3 + Pillow):

```
python3 packages/web/art/codex/library2/export-scenes.py
python3 packages/web/art/codex/library2/export-companions.py
python3 packages/web/art/codex/library2/export-terrain.py
python3 packages/web/art/measure-sprites.py
```

The established pose exporter now has an opt-in detached-component attachment step for bow/string and magic pixels; default behavior for the original monsters is unchanged. Components must be close to a full-body pose. This prevents dropping Tamsin's detached bow artwork. The companion export validates all 55 nonempty transparent frames and edge margins.

## Review and validation

- `npm install` succeeded using a writable npm cache; lockfile kept unchanged.
- `npm test`: 270 passed, one skipped, all 30 files passed. First attempt failed because the restricted sandbox forbids listening sockets; the same tests passed with network/local socket access.
- `npm run typecheck`: passed.
- `npm run build`: passed; existing Phaser chunk-size advisory remains.
- Static inspection: scenes, companion contact sheet and both board previews.
- Actual Chromium gallery checks at 1440×1000 and 390×844: all 71 pending entries, 75 image loads, 18 sprite canvases, two board canvases, all five animations, mirroring, pause and step; no page errors or mobile overflow.

Viewer: `docs/art/library-batch-2-complete.html`. Serve the repository root on port 4173. Checks and screenshots: `library-batch-2-complete-browser-check.json` and `library-batch-2-complete-{1440,390}.png`. Re-run `review-complete.cjs` with Playwright installed (or `PLAYWRIGHT_MODULE` pointing to it); Chromium defaults to `/usr/bin/chromium`.

Other previews: `library-batch-2-scenes.jpg`, `library-batch-2-companions.png`, `board-cave-preview.png`, `board-crypt-preview.png`. The older monster-only `library-batch-2.png` remains available.

## Claude handoff and limitations

These are gallery/static checks, not an encounter playtest. Claude must implement exact missing monster mechanics, validate attack-event mapping and Large/special movement, wire library props into the renderer, bind companion portraits, and playtest before promoting integration. Keep stable saved identities.

All sprites use one facing mirrored left/right, compact four-pose walks and one attack. No north/south, weapon-specific alternatives, flight or special-ability sequences are implied. Existing batch 2 monster polish notes still apply: captain offhand blade occlusion and compact gaits require battle review. New terrain is visually reviewed for contrast, not mathematically seamless. Both maps share a compatible two-chamber layout with broad crossing; future unique map variants can build on them.

The optional boar/panther/giant-badger sets and extra Bram appearance are outside this required batch and remain pending. Hero/class art, spell effects/icons and batch 1 fixes stay on their separate branches.
