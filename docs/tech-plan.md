# Tech Plan (Foundation)

Status: proposed. Companion to `design.md`.

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
