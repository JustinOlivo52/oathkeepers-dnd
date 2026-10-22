# Codex Brief: Spell Effects and Icons

The game now has spells in battle (24 so far, listed below). Today their effects are drawn in code: a colored ball for bolts, a colored ring for hits, tinted squares for areas. This brief replaces those with real art. Follow [`LIBRARY.md`](LIBRARY.md) for folders, catalog fields and content rules, and match the existing Codex style: detailed 2D fantasy, dark outlines, warm torchlit palette, readable at game size.

**Branch:** `art/spell-effects`, from the latest `master`. Separate from the batch 2 branch.

## How the game uses it

The game looks for effects by id, most specific first, and falls back to the code-drawn effect when nothing exists. So every asset is optional, and a partial delivery still helps.

| When | It looks for | Then | Then |
|---|---|---|---|
| A bolt flies (Fire Bolt, Magic Missile...) | `vfx-<spell>-projectile` | `vfx-<damage type>-projectile` | code |
| A spell hits one creature | `vfx-<spell>` (role impact) | `vfx-<damage type or kind>` | code |
| An area goes off (Shatter, Acid Splash) | `vfx-<spell>` (role area) | `vfx-<damage type>` (role area) | code |
| Spell buttons | `icon-<spell>` | | text only |

Damage types: `fire`, `cold`, `lightning`, `acid`, `poison`, `necrotic`, `radiant`, `force`, `thunder`, `psychic`. Kinds for spells without damage: `heal`, `bless`, `shield-of-faith`, `hold`, `teleport`.

## Formats

| Role | Frames | Frame size | Notes |
|---|---|---|---|
| projectile | 4, looped while it flies | 64x64 | Points **right** (the game rotates it). Centred in the frame. |
| impact | 8, played once | 192x192 | Centred on the creature's chest. Starts small, peaks around frame 3, fades out by frame 8. |
| area | 8, played once | 384x384 | Seen from above, round, fills the frame edge to edge at its peak. The game stretches it to the area's size. |
| icon | 1 | 64x64 | Simple, bold symbol on a dark rounded square, readable at 20x20. No text. |

All PNG, transparent background, one row of frames, nothing touching the frame edge. Keep effects mostly additive-looking (glows, sparks, light) so they read on any floor tile.

Files: `assets/sprites/vfx/<id>.png` for effects, `assets/library/icons/<id>.png` for icons.

Catalog entries:

```json
{
  "id": "vfx-fire-projectile",
  "kind": "vfx",
  "title": "Fire bolt in flight",
  "tags": [],
  "vfx": { "file": "sprites/vfx/vfx-fire-projectile.png", "frameWidth": 64, "frameHeight": 64, "frames": 4, "fps": 14, "role": "projectile" },
  "artStatus": "ready", "mechanicsStatus": "not-required", "integrationStatus": "pending",
  "source": "codex-imagegen", "added": "YYYY-MM-DD"
}
```

```json
{ "id": "icon-fire-bolt", "kind": "icon", "title": "Fire Bolt icon", "tags": [], "image": "library/icons/icon-fire-bolt.png",
  "artStatus": "ready", "mechanicsStatus": "not-required", "integrationStatus": "pending", "source": "codex-imagegen", "added": "YYYY-MM-DD" }
```

Effects and icons need no tags (the game finds them by id).

## 1. Damage type effects (highest value: they cover every spell)

For each of the 10 damage types, a projectile and an impact: `vfx-<type>-projectile` and `vfx-<type>`. 20 sheets.

| Type | Look |
|---|---|
| fire | Orange-yellow flame, embers |
| cold | Pale blue frost shards, white mist |
| lightning | Jagged white-yellow arcs |
| acid | Green bubbling splash, droplets |
| poison | Sickly green cloud |
| necrotic | Purple-black wisps, faint skulls are fine, no gore |
| radiant | Warm gold-white light, rays |
| force | Violet energy, clean geometric shards |
| thunder | Pale blue shockwave rings |
| psychic | Pink-magenta ripples |

Plus impacts for the non-damage kinds: `vfx-heal` (green-gold motes rising), `vfx-bless` (soft golden glow), `vfx-shield-of-faith` (a shimmering golden barrier), `vfx-hold` (violet chains of light closing in), `vfx-teleport` (silver mist puff).

## 2. Areas (2)

`vfx-thunder` and `vfx-acid` with role **area** (Shatter and Acid Splash). Seen from above: a thunder blast ring, an acid splash. Use different ids if the impact versions already exist: `vfx-shatter` and `vfx-acid-splash` (role area).

## 3. Signature spells (optional, after 1 and 2)

| Id | Role | Look |
|---|---|---|
| `vfx-magic-missile-projectile` | projectile | Small glowing violet dart |
| `vfx-eldritch-blast-projectile` | projectile | Crackling purple-green beam head |
| `vfx-scorching-ray-projectile` | projectile | Thin streak of fire |
| `vfx-sacred-flame` | impact | Column of radiant light from above |
| `vfx-guiding-bolt` | impact | Bright starburst that leaves a glowing mark |
| `vfx-spiritual-weapon` | impact | A spectral mace swinging down |
| `vfx-vicious-mockery` | impact | Jagged pink ripples (no text) |

## 4. Spell icons (24)

`icon-<spell id>` for every spell in the game:

fire-bolt, ray-of-frost, shocking-grasp, acid-splash, chill-touch, poison-spray, eldritch-blast, sacred-flame, produce-flame, vicious-mockery, magic-missile, burning-hands, thunderwave, guiding-bolt, inflict-wounds, cure-wounds, healing-word, bless, shield-of-faith, scorching-ray, shatter, hold-person, misty-step, spiritual-weapon.

Original symbols only (no official D&D spell art or icons).

## How to work

1. Work in section order and push after each section.
2. Keep raw generations and processing scripts in `packages/web/art/codex/`, as before.
3. Don't change game code, rules or stat blocks.
4. Preview `docs/art/spell-effects.png`: every effect's frames in a row, and all icons in a grid.
5. `npm test`, `npm run typecheck`, `npm run build` pass; branch pushed.
6. Notes in `docs/art/CODEX_NOTES_SPELLS.md`: what was made, how, what was skipped.
