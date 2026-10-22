# Reusable art library and monster production plan

Status: proposed production plan, not an implemented asset-selection service or completed monster catalog.

## Agreed direction

Build original, preapproved detailed 2D fantasy artwork in advance. Runtime encounters assemble compatible assets from a catalog rather than waiting for new sprite generation. Codex handles art production and visual review; Claude Code remains lead developer and handles catalog integration, rules and encounter assembly. GitHub assets and documentation carry context between development sessions.

Keep the chosen Fallen Abbey / Lanternwood visual direction: natural character proportions, readable equipment, textured stone and foliage, restrained tactical overlays. Treat original generated images as source artwork requiring inspection and registration, not automatically production-ready animation.

## Scope of "all monsters"

Start with a version-pinned roster from the project's SRD 5.2 rules baseline; use the official SRD 5.2.1 source to inventory corrections and record any version migration explicitly. Do not silently change existing rules or import every published Monster Manual or setting-specific creature. Official source: https://www.dndbeyond.com/srd

Before forecasting totals, enumerate actual stat blocks and group them into distinct visual designs. Stat-block count, species count, age variants, equipment variants and unique animated bodies are different numbers. Include beasts, NPC stat blocks, swarms and summoned forms in the scope decision. Large creatures and multi-square footprints require explicit renderer AND rules support, not merely larger PNGs.

## Library organization

Keep runtime art in a discoverable catalog, not one enormous image:
- Environments: forest, frontier town, abbey, dungeon, cave; later regional expansions.
- Modular terrain and props, with compatible tile edges, perspective and palette.
- Adventurers, NPCs and monster sprite sets.
- Portraits and encounter illustrations, separate from battle sprites.
- Reusable projectiles, impacts, spell effects and condition indicators.

Per asset record:
id, kind, source/version, environment tags, faction/role tags, size, footprint, art family, resource paths, frame layout, foot anchor, animation names, supported facing directions, supported attacks, license/provenance, review status and estimated download size.

Per creature record:
rules id, visual asset id, mechanics status, animation status, intended environments, supported movement modes and special effects. Several stat blocks may share a base where appropriate, but distinct silhouettes and attacks must remain recognizable.

Keep generated originals, processing scripts, runtime atlases and preview evidence. Version catalog and assets together. Load encounter-required bundles; do not download the entire bestiary on startup.

## Runtime selection

DM supplies structured encounter intent and valid creature ids. Code filters assets by compatibility, readiness, biome, footprint and rules support, then chooses among suitable variants with seeded randomness. Persist selected ids and layout in the adventure save for reproducibility.

Only creatures with BOTH validated mechanics and approved art may enter combat automatically. An art-ready dragon is not playable while flight, breath weapons, area effects or its footprint remain unsupported. If no compatible asset exists, select a supported alternative or defer that encounter; never invent an asset path.

## Readiness stages

1. Cataloged: source entry and scope verified.
2. Design approved: silhouette, palette, size and portrait/reference approved.
3. Animation draft: required poses generated.
4. Art ready: transparency, frame bounds, consistent scale, anchors and motion reviewed.
5. Mechanics ready: stat block, features, movement and tactics supported and tested.
6. Integrated: art mapped to actual events, size and facing.
7. Encounter ready: browser playtest passed, including attack, damage and defeat.

Track art and mechanics independently. Do not mark a creature playable just because its sheet exports.

## Workload scenarios

Existing sheet format: 11 frames per creature, one source facing mirrored left/right, one attack. This is a starter format, not a complete animation library.

Illustrative arithmetic only; these are NOT verified SRD roster counts:
- 50 unique designs x 11 = 550 starter frames.
- 150 unique designs x 11 = 1,650 starter frames.
- 300 unique designs x 11 = 3,300 starter frames.
- Four separately authored facings at the same baseline would make the 300-design example 13,200 frames before extra attacks, flight, casting, transformations or smoother in-betweens. Mirroring compatible facings can reduce actual drawn views.

Difficulty varies dramatically. A humanoid melee attacker is simpler than a winged dragon, deforming ooze, swarm or multi-form boss. Equipment and palette variants can reuse a base where visually honest; a wolf, spider, skeleton and dragon need different bodies and motion.

Generating a candidate atlas may be quick. Consistency repair, registration, coherent pose transitions, reruns, actual attack-event matching and browser testing determine production throughput. No reliable full-roster completion date or generation budget exists yet. Treat a polished complete bestiary as a sustained production program rather than a single bulk-generation run.

## Calibration pilot

Use the existing goblin as a quality reference. Produce eight distinct representative creatures, verifying each against the pinned roster before work:
- Skeleton: armed biped.
- Zombie: slow biped with distinct gait.
- Wolf: quadruped.
- Giant spider: many-legged creature.
- Giant bat: flying motion.
- Gray ooze: nonrigid body.
- Ogre: large creature and footprint.
- One SRD dragon entry: complex boss, wings and breath effects.

If the engine cannot support a pilot creature yet, deliver its art as art-ready and keep it out of runtime encounters. The pilot is a pipeline test, not a promise that all mechanics will be added simultaneously.

Record per creature: generation attempts, review/correction time, integration time, approved output frames, download size, supported directions/attacks, defects and any measured API costs. Use medians by body family and a rework allowance to estimate the inventoried roster. Do not extrapolate from the fastest successful goblin alone.

## Release approach

A. Establish catalog schema, art guide and readiness checks.
B. Complete the representative pilot and measure throughput.
C. Release a first regional collection of roughly 20-30 approved encounter-ready creature designs plus forest/town/ruin/cave art.
D. Expand by body family and campaign tier, tracking progress against the full scoped roster.
E. Fill rare bosses and special movement/attack sets after their engine support exists.

The goal can be full prebuilt coverage while releasing useful reviewed collections progressively. Do not block the game on finishing every possible creature.

## Immediate handoff for Claude Code

Review this proposal before implementation. Keep existing saves and asset paths compatible. Add catalog validation and readiness gating before changing the DM's encounter-selection contract. Preserve the current rule: AI narrates and proposes; the engine validates and resolves.

No live image-generation API, provider credential, spending approval, catalog implementation or mass art batch was created by this planning change.
