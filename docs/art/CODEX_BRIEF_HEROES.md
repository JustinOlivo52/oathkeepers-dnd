# Codex Brief: Heroes (Classes, Species, Portraits)

Players can build any of 12 classes and 9 species, but the game has only 4 hero sheets (`hero-martial`, `hero-expert`, `hero-arcane`, `hero-divine`), so a Bard and a Rogue look the same, and the builder has no pictures at all. This brief gives every class and species its own art. Follow the [Art library spec](../OATHKEEPERS.md#art-library-spec) for folders, formats, catalog fields and content rules, and match the existing Codex style: detailed 2D fantasy, dark outlines, warm torchlit palette, readable at game size.

**Branch:** `art/heroes`, from the latest `master`. Separate from the batch 2, batch 1 fixes and spell effects branches. If you also do [batch 2 section 5](CODEX_BRIEF_LIBRARY_2.md) (the companions' own sprites), keep it on the batch 2 branch.

## How to work

1. Work in the order below. Each part is useful on its own, so merge-ready parts can land before the rest.
2. Add a catalog entry for every file in `packages/content/data/art-catalog.json`. The schema already supports the new kinds (`portrait`, `card`) and fields (`classId`, `speciesId`); don't change game code.
3. After any battle sprite, run `python3 packages/web/art/measure-sprites.py`.
4. Run `npm test` before you finish. The catalog tests check every entry.
5. Write `docs/art/CODEX_NOTES_HEROES.md`: what you made, how, anything skipped or worth a second look.
6. Make a contact sheet at `docs/art/heroes.png`: every sheet's idle frame in a row (small ones next to their medium version), the 36 portraits in a 9×4 grid, and all 21 cards.

Setting rules for everyone: original designs only. No real-world religious symbols, no copies of official D&D art or characters, no logos or text in the images.

## 1. Class battle sprites (12, highest priority)

One sheet per class, same layout as the current hero sheets: 11 frames of 192x192, feet at (96, 166), facing right (idle 0-1, walk 2-5, attack 6-8, hit 9, down 10). A human-sized adventurer of no particular species; mix presentations across the set (roughly half men, half women). The class should read at a glance from silhouette and gear.

| Catalog id | Class | Look | Attack frames |
|---|---|---|---|
| `hero-class-barbarian` | Barbarian | Hide armor and fur, bare arms, greataxe, wild hair | Overhead axe chop |
| `hero-class-bard` | Bard | Fitted leather, bright cloak, rapier, lute on the back | Rapier thrust |
| `hero-class-cleric` | Cleric | Chain mail, shield with a plain sun or star emblem, mace | Mace swing |
| `hero-class-druid` | Druid | Leather and bark-like trim, leaves, wooden shield, sickle or staff | Raised hand, green glow at the fingers |
| `hero-class-fighter` | Fighter | Chain mail, shield, longsword (can stay close to `hero-martial`) | Sword slash |
| `hero-class-monk` | Monk | Simple wrapped cloth, sash, bare hands or a short staff, no armor | Palm strike or kick |
| `hero-class-paladin` | Paladin | Heavier plate-like armor, tabard, greatsword or sword and shield | Two-handed swing with a faint gold glint |
| `hero-class-ranger` | Ranger | Studded leather, hooded green-brown cloak, longbow, shortsword | Longbow draw and release |
| `hero-class-rogue` | Rogue | Dark hooded leather, two daggers or shortsword, belt pouches | Quick low stab |
| `hero-class-sorcerer` | Sorcerer | No armor, travel clothes with a draconic scale motif, hands crackling | Two-handed casting thrust with a spark |
| `hero-class-warlock` | Warlock | Dark robes, an odd focus (a carved horn, a strange gem), purple-black accents | Outstretched hand, dark violet bolt start |
| `hero-class-wizard` | Wizard | Long robes, quarterstaff, spellbook at the hip | Staff raised, blue spark |

Catalog: kind `hero`, `classId` set to the class id, a `sprite` block like the existing hero sheets (`rulesSize: "medium"`), tags at least: the class's archetype (`martial` for barbarian, fighter, monk; `expert` for bard, ranger, rogue; `arcane` for sorcerer, warlock, wizard; `divine` for cleric, druid, paladin), `hero` and one `combat` tag. `artStatus: "ready"`, `mechanicsStatus: "not-required"`, `integrationStatus: "pending"`.

## 2. Small versions for halflings and gnomes (12)

The same 12 designs, redrawn small: about two thirds the height of the medium version in the same 192x192 frame, feet still at (96, 166). Keep the gear; scale weapons to the smaller body (a halfling barbarian's axe is smaller, not the same axe).

Ids `hero-class-<class>-small` (for example `hero-class-rogue-small`), files `sprites/hero-class-<class>-small.png`, same catalog fields as part 1 plus `rulesSize: "small"`.

## 3. Player portraits (36)

Players pick one of these in the character builder, and it shows in the story, the party list and the battle panel. Four per species, one per archetype, with mixed presentations. 512x512 WebP, quality about 85, under 150 KB, at `library/portraits/player-<species>-<archetype>.webp`. Chest-up, three-quarter view, a soft painted background, the same framing as the NPC portraits. The archetype shows through clothing and gear (armor and a weapon for martial, leather and a hood or bow for expert, robes and a glow for arcane, holy-symbol or nature details for divine).

| Species | Look notes | Presentations (martial, expert, arcane, divine) |
|---|---|---|
| Dragonborn | Draconic head and scales; vary scale colors across the four (red, bronze, blue, green) | man, woman, woman, man |
| Dwarf | Stocky, broad, braided hair or beard | woman, man, man, woman |
| Elf | Pointed ears, fine features; one could be a darker-skinned drow-style elf | man, woman, man, woman |
| Gnome | Small, large expressive eyes, wild hair | woman, man, woman, man |
| Goliath | Very tall and broad, grey or stone-toned skin with markings | man, woman, man, woman |
| Halfling | Small, round friendly face, curly hair | woman, man, man, woman |
| Human | Vary skin tones and ages across the four | man, woman, woman, man |
| Orc | Grey-green skin, tusks, strong jaw | woman, man, woman, man |
| Tiefling | Horns, solid-color eyes, varied skin tones (red, purple, ash), a tail can show | man, woman, man, woman |

Catalog: kind `portrait`, id `player-<species>-<archetype>`, `image` set, tags: the species, the archetype, the presentation (`man`, `woman` or `androgynous`), and `hero`. `artStatus: "ready"`, `mechanicsStatus: "not-required"`, `integrationStatus: "pending"`.

## 4. Builder cards (21)

The character builder shows a card for each class and species. 768x512 WebP, quality about 80, under 150 KB.

- **Class cards (12):** `library/cards/class-<class>.webp`, catalog id `card-class-<class>`, `classId` set. One adventurer of that class mid-action in a fitting place (the barbarian roaring on a ridge, the wizard reading by candlelight). Can reuse the design from part 1, painted larger.
- **Species cards (9):** `library/cards/species-<species>.webp`, catalog id `card-species-<species>`, `speciesId` set. One or two people of that species in a typical frontier scene.

Catalog: kind `card`, `image` set, tags optional, `artStatus: "ready"`, `mechanicsStatus: "not-required"`, `integrationStatus: "pending"`.

Leave the left third of each card fairly calm (sky, wall, shadow): the builder puts the name and a short description over it.

## Done means

- [ ] 12 class sheets and 12 small sheets, `measure-sprites.py` run
- [ ] 36 portraits and 21 cards, each within its size budget
- [ ] Every file has a catalog entry, and `npm test` passes
- [ ] `docs/art/heroes.png` contact sheet
- [ ] `docs/art/CODEX_NOTES_HEROES.md` written

After it merges, Claude Code hooks it in: the builder shows the cards and the portrait picker, and the grid uses the class sheet (small for halflings and gnomes) unless a character has its own `hero-<character id>` sheet.
