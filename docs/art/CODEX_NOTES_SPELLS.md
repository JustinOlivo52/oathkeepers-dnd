# Spell artwork checkpoints

## Checkpoint 1 — four spell icons (2026-10-24)

Branch: `art/spell-icons-checkpoint-1`, based on master `1636d3c`.

Exported from the existing `packages/web/art/codex/source/completion/icons-0.png`:

- `icon-fire-bolt`
- `icon-ray-of-frost`
- `icon-shocking-grasp`
- `icon-acid-splash`

All four PNGs are 64×64 RGBA with clear edge margins and under 10 KB each.
Their catalog entries are art-ready, mechanics not required, integration pending.
The existing battle button lookup selects art-ready icons; no renderer code changed.
The 64px and 20px preview was inspected, but live battle UI acceptance remains pending.
No artwork was regenerated and no existing asset was replaced.

Reproduce from the repository root (Python 3 and Pillow):

```sh
python3 packages/web/art/codex/completion/export-icons-checkpoint-1.py
```

The script checks the source hash and dimensions before using reviewed crop boxes.
It updates these four catalog entries idempotently, writes only this checkpoint's
exports, and emits a preview and JSON report with crop boxes, output sizes and hashes:
`docs/art/spell-icons-checkpoint-1.png` and `docs/art/spell-icons-checkpoint-1.json`.
Do not assume equal grid cells: the saved atlas has uneven gutters and bottom padding.

Validation: source/export bounds, transparency and byte-budget assertions passed;
TypeScript and production build passed (existing large-bundle advisory).
Full test suite: 30 files passed; 270 tests passed, 1 skipped. Tests ran with
network access so the local HTTP server fixtures could bind.

## Resume here

1. Confirm this branch/PR and inspect its preview; do not regenerate these four icons.
2. Next small export batch: Chill Touch, Poison Spray, Eldritch Blast, Sacred Flame
   (the second painted row of the same saved atlas). Review their actual crop boxes.
3. Then continue through the remaining 32 icons in the two saved icon atlases.
4. Export the 50 effect definitions from the 13 saved `effects-*.png` source atlases.
   These are source-only, not completed runtime sheets. Write a separate export path
   for the required projectile/impact/area dimensions and frame counts.
5. Review each subset in the real UI before promoting integration readiness.

Current spell-art total after this checkpoint: **4/40 icons exported; 0/50 effect
sheets exported**. All source atlases already exist; reuse them. Leave all other
artwork, monster rules, archived alternatives and unrelated readiness flags intact.
