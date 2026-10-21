# Tech Plan (Foundation)

Status: Phase 1 and Phase 2 done. Companion to `design.md`.

## 1. Guiding principles

1. **The engine is the source of truth.** All rules, dice and game state live in the rules engine. The AI DM only narrates and calls engine functions.
2. **The server is authoritative.** Clients send requests ("I attack the goblin"). The server checks them against the rules, applies them and sends everyone the result. No cheating, no desync.
3. **Content is data.** Classes, spells, monsters and items are data files, not hand-written code.
4. **Everything is an event.** Every action is recorded in a game log. The log powers saves, recaps, AI memory and debugging.
5. **Solo and multiplayer use the same system.** Solo play is a room with one player.

## 2. Stack

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript everywhere | One language for client, server and engine |
| Repo layout | Monorepo with workspaces | Shared types between packages |
| Rules engine | Plain TypeScript, no dependencies | Pure logic, easy to test, runs anywhere |
| Content | JSON data files with schema validation | Catches bad data before it breaks the game |
| Server | Node.js with a multiplayer room framework (Colyseus) | Rooms, state sync and reconnects out of the box |
| Grid and map view | Phaser | Mature 2D game library, good for pixel art |
| Menus, sheets, chat | React | Character sheets and builders are UI-heavy |
| Database | SQLite to start, Postgres when hosted | Simple now, scales later |
| AI DM | Provider layer (hosted model first, local later) | Swap models without touching the game |
| Voice | Browser speech-to-text and text-to-speech first | Free. Upgrade if quality is not good enough |
| Tests | Vitest | Fast unit tests for the engine |

Note: AI API keys live on the server only, never in the browser. That is one reason solo play also goes through the server.

## 3. Packages

```
packages/
  engine/    Rules: dice, checks, combat, conditions, spells, rests, leveling
  content/   SRD 5.2 data + our homebrew, with schemas
  dm/        AI DM: provider layer, prompts, tools, memory
  server/    Rooms, players, saves, event log
  client/    Browser game: Phaser grid + React UI
```

## 4. Rules engine design

- **Effects system:** Most features are modifiers and triggers ("+2 AC while wearing armor", "on hit, deal 1d6 extra"). Defined in data, run by the engine. Rare odd features get small code hooks.
- **Core systems:** ability checks, saves, attacks, damage and resistances, conditions, action economy, spell slots and concentration, rests, death saves, XP and leveling.
- **Dice:** Server-side random rolls. The player's click sends the roll request, and the client shows the dice animation with the real result. Every roll is logged.
- **Encounter scaling:** Built from the party present right now (solo, companions, or up to 6 players), using the per-character XP budget.

## 5. Combat

### Controls: players act on the board, not by typing
- Click your character to select it. Reachable squares light up.
- Click a square to move. The path and any opportunity attack risk are shown first.
- Action bar: Attack, Dash, Dodge, Disengage, Help, Hide, spells, items, class features. Spent actions grey out.
- Targeting: click an enemy to attack. Range, area templates and affected creatures are previewed before you confirm.
- Click to roll. Dice animate on screen with the real result.
- Reactions pop up when triggered ("Goblin moves away. Opportunity attack?" / "You're hit. Cast Shield?").
- End Turn button. Initiative order shown along the top.

### Creative actions (optional text or voice)
- For anything outside the action bar ("I kick the brazier onto the goblins", "I swing from the chandelier"), the player types or says it.
- The DM decides the check and the engine resolves it, then the result plays out on the board.

### DM in combat
- Short narration of big moments (crits, kills, spells), not every move, to keep turns fast.
- Monsters and companions act on the board using rule-based tactics.

### Rules
- Square grid, 5 ft per square
- Movement, difficult terrain, opportunity attacks, cover, line of sight
- Area templates for spells (cone, sphere, line, cube)
- Monster AI: rule-based tactics (target the wounded, casters stay back, flee when losing)
- Same rule-based approach drives AI companions in combat

## 6. AI DM design

- **Tools the DM can call:** `request_check`, `request_save`, `start_combat`, `grant_xp`, `give_item`, `move_scene`, `whisper_player`, `update_npc`, `add_quest`, and more.
- **Engine validates every call.** The DM cannot change HP, dice or rules directly.
- **Context sent to the DM each turn:** current scene, party summary, recent events, relevant NPCs and quests, campaign story beats.
- **Memory:** After each session, an automatic summary plus updates to the NPC, location and quest records. Old details are looked up when relevant instead of sent every time.
- **Spotlight rounds:** The server gathers player actions in a round before sending them to the DM.

## 7. Maps

- Procedural generation: dungeons (rooms and corridors), caves, wilderness, towns
- Pixel-art tilesets: start with a licensed asset pack, replace with custom art later
- Art trial at the start of Phase 3: Claude builds sample pixel sprites (a character, a goblin, a tile set) with idle, walk and attack animations. Justin compares the result against Codex and asset packs before choosing the art source.
- All rendering code uses a standard sprite sheet format, so the art source can change without code changes
- The DM can ask for a map by type and theme ("ruined chapel, small, overgrown")

## 8. Multiplayer

- Rooms with invite links, up to 6 players
- Drop in at natural breaks only. The server holds joiners in a waiting state until the next break.
- Reconnects keep your seat if you drop mid-session
- Text and voice input, DM narration read aloud

## 9. First milestone (Phase 1)

The rules engine, tested, with no visuals:
- Dice and roll notation (`2d6+3`, advantage, disadvantage)
- Ability scores, modifiers, proficiency
- Ability checks and saving throws
- One class (Fighter) and one monster (Goblin) as data
- A text-only combat between them that runs to completion in tests

Done when: a Fighter vs Goblin fight runs start to finish in tests, following 5e rules, with every roll logged.

### Phase 1 progress

Done:
- Dice notation, advantage and disadvantage, critical dice, seeded RNG for repeatable fights
- Ability modifiers, proficiency, ability checks, skill checks, saving throws
- Damage with resistance, vulnerability, immunity and temp HP
- Dropping to 0 HP, death saves, massive damage, healing back up
- Combat: initiative (ties by Dex), turns, action economy, attacks, crits, auto-crit on downed targets
- Fighter features: Second Wind, Action Surge, Weapon Mastery (Sap), Dueling, Champion (Improved Critical, initiative advantage from Remarkable Athlete)
- Content as validated JSON: Fighter class, Goblin Warrior, longsword, scimitar, shortbow, armor, a premade level 3 Fighter
- Milestone test: Fighter vs Goblin runs to completion with every die roll logged

Not yet:
- Tactical Mind, Remarkable Athlete's Athletics bonus, other weapon masteries
- Goblin Nimble Escape (needs movement and the grid)
- Rests, conditions beyond unconscious, reactions, spells

### Phase 2 progress (character builder)

Done:
- Content for all 12 SRD classes (levels 1 to 3, one subclass each), 9 species with lineages, 4 backgrounds, origin and fighting style feats, the full weapon and armor tables
- Creation rules: standard array, point buy (27 points), 4d6 drop lowest; background +2/+1 or +1/+1/+1 (max 20); class, species, subclass and Skilled skill picks with no duplicates; Expertise; class choices (Divine Order, Primal Order); fighting styles; weapon mastery; armor, shield and weapon training; languages
- Every rule is checked per step with plain-language messages, and a character only saves when every step is complete
- Sheet math: HP by hit die, Unarmored Defense (Barbarian, Monk, Draconic Sorcerer), Martial Arts, Dwarven Toughness, lineage speed and resistances, heavy armor Strength penalty, Alert, Jack of All Trades, Expertise, Unarmed Strike
- Browser builder with a live character sheet, saved characters, and "test in a fight"

Simplified for now:
- Equipment: pick any trained gear instead of official starting packages and gold
- Spells: casters are flagged; spell choice arrives with the spell system
- Many class features show on the sheet as "coming soon" until combat supports them
- Dueling is not in the SRD, so the premade Fighter now uses Defense
