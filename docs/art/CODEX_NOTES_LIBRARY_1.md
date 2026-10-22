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
