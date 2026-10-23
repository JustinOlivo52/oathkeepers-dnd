# Tech Plan (Foundation)

Status: Phases 1 to 3 done, Phase 4 (AI DM) done except prompt tuning, Phase 5 (leveling to 5, player saves) done, art library batch 1 integrated. Companion to `design.md`.

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

### Phase 3 progress (grid combat)

Done:
- Art trial: Claude's text-drawn pixel sprites vs Codex's image-generated art; Codex's art was chosen (see `docs/art/README.md`)
- Grid rules: 5 ft squares with 5 ft diagonals, difficult terrain, no corner cutting, walls block line of sight
- Movement: pathfinding, speed limits, pass through allies but not enemies, can't end on an occupied square
- Reach and range: melee needs reach, thrown weapons work at range, long range and adjacent enemies give ranged disadvantage
- Opportunity attacks when leaving reach, one reaction per round, prevented by Disengage
- Actions: Dash, Disengage, Dodge, plus Goblin Nimble Escape (bonus action Disengage)
- Map generator: seeded rooms and corridors, rubble patches, separate party and enemy spawn rooms, always connected
- Monster tactics on the grid: shoot when possible, close in and melee, Dash when out of reach, wounded skirmishers back off
- Battle screen (Phaser): hand-built Fallen Abbey map or a generated dungeon, camera zoom and pan; click a blue square to move (path preview warns about opportunity attacks), click an enemy to attack, then press Roll d20
- Animations play from the event log: walking, attacks, arrows, hit flashes, damage numbers, downed and dead creatures
- Balance check script: `npm run balance -- 3` (Bram beats 3 goblins about 70% of the time)

Not yet:
- Player choice on reactions (opportunity attacks are taken automatically)
- Cover, prone, grappling, hiding, Help action
- Up and down facing sprites, separate ranged and spell attack animations
- Spells and most class features in combat

### Phase 4 progress (AI Dungeon Master)

Part 1 done:
- `packages/dm`: provider layer (any model can run the DM), the Director (DM loop), tools, system prompt, story state
- DM tools: request_check, request_save, start_combat, grant_xp, give_item, give_gold, set_scene, update_npc, update_quest, whisper, long_rest
- Every tool call is validated; bad input or unknown monsters go back to the model as errors instead of breaking the game
- Rolls: the DM asks, the player clicks Roll, the engine rolls with the character's real modifiers, the result goes back to the DM
- Battles: start_combat hands off to the grid battle with the DM's chosen enemies; HP, XP (from monster XP) and the outcome come back to the story
- `packages/server`: Node server holding the API key, Claude provider (Sonnet 5.5, medium effort, prompt caching, refusal fallback), adventures saved as JSON, monthly spending cap
- Demo DM: scripted, free, no key; runs on the server or entirely in the browser (so a static Netlify deploy still plays)
- Adventure screen: story feed, typed actions, roll and battle prompts, quests, NPCs, inventory, gold, AI cost, resume saved adventure

Part 2 done:
- Streaming narration: the server streams DM text over SSE, the Adventure screen shows it as it's written (demo DM streams too)
- Sessions: End session writes a recap with Haiku 5.5 (recap, open threads, NPC notes); the next session starts a fresh conversation with "Story so far" in the prompt, which keeps cost flat as the campaign grows
- DM quality tests: 6 scenarios (routine action, uncertain climb, fight, unavailable monster, new location, trap) with automatic checks (rolls asked for and waited on, DC kept secret, short replies, valid tools, ready monsters only, scene art, no speaking for the player). `npm run eval:dm` runs them against Claude (about $0.10 to $0.30, capped at $1) and saves a report to `packages/server/data/evals/`

Playtest round 1 changes:
- The DM narrates the player's own action vividly before the outcome
- Every character starts with 2 Potions of Healing (2d4 + 2; Bonus Action in battle), drinkable in battle or from the story inventory
- Auto end turn once no action, movement or useful bonus action is left (Action Surge isn't counted); a checkbox turns it off
- DM voice: the browser's built-in speech reads narration sentence by sentence as it streams; voice and speed settings; free, quality depends on the device
- Dev server accepts GitHub Codespaces forwarded ports, for testing away from home
- Straight-line movement: among equally cheap routes, paths follow the line to the target (players and monsters)
- AI companions: choose up to 3 premade companions (Wren Ashdown, halfling rogue; Brother Odric Vale, dwarf paladin; Tamsin Reed, wood elf ranger) or your own saved characters. The DM voices them in the story; rule-based tactics fight for them (Second Wind, potions when badly hurt). They share XP and keep their own HP and potions

Class features in combat (level 1 to 3, players and AI):
- Fighter: Second Wind, Action Surge, Improved Critical
- Rogue: Sneak Attack, Cunning Action (bonus Dash or Disengage), Steady Aim
- Barbarian: Rage (lasts the whole battle here, simplified), Reckless Attack, Frenzy
- Paladin: Lay on Hands, Divine Smite (free daily cast, then spell slots; extra vs undead and fiends), Sacred Weapon
- Ranger: Hunter's Mark (Favored Enemy casts, then slots; concentration; free to move off a fallen target), Colossus Slayer
- Monk: Martial Arts bonus strike, Flurry of Blows, Patient Defense, Step of the Wind
- Weapon masteries: Sap, Vex, Slow, Graze, Topple (not yet: Push, Nick, Cleave)
- Limited uses carry over between battles; short_rest (Hit Dice healing, short-rest features, one Second Wind use) and long_rest refill them
- AI: heals allies with Lay on Hands, rages, marks the toughest visible enemy, smites with the free cast and on undead, fiends and big targets, aims and sneak attacks, flurries
- `npm run balance -- 3 goblin-warrior <character-id>` shows which features fired per fight

Spells in battle:
- 24 SRD spells as data (`packages/content/data/spells.json`): 10 cantrips, 9 level 1, 5 level 2, for all 8 casting classes
- Spell attacks, saving throws (half on success), auto-hit darts, areas (sphere, cone, cube; they hit allies too), healing, Bless, Shield of Faith, Hold Person (paralyzed, repeat saves), Misty Step, Spiritual Weapon, Guiding Bolt, Vicious Mockery, Ray of Frost, Shocking Grasp
- 2024 slot tables (full, half and pact casters; pact slots back on a short rest), upcasting, one slot spell per turn, concentration (Con save on damage, ends at 0 HP)
- Character Builder step 8 picks cantrips and prepared spells (2024 counts); older characters get sensible defaults
- New caster companions: Sister Maren Holt (human cleric) and Pip Thistlewick (gnome wizard)
- AI casters heal the badly hurt, keep Spiritual Weapon swinging, Misty Step away, hold humanoids, Bless the party, use areas only when no ally is caught, save slots for tough targets
- Battle screen: spell bar with slots, upcast picker, multi-target picking, area preview on hover; code-drawn effects until library art exists (`docs/art/CODEX_BRIEF_SPELLS.md`)

Class features, round 2:
- Bard: Bardic Inspiration (the die is added automatically when it turns a failed attack or save into a success), Cutting Words (automatic reaction when it can turn an enemy's hit into a miss)
- Warlock: Eldritch Invocations picked in the builder (Agonizing Blast, Armor of Shadows, Eldritch Mind, Eldritch Spear, Pact of the Blade, Repelling Blast, plus story-only Devil's Sight, Mask of Many Faces, Misty Visions), Dark One's Blessing, Magical Cunning (button on the story screen)
- Sorcerer: Innate Sorcery, Font of Magic (points into slots and back), Metamagic picked in the builder (Careful, Distant, Empowered, Heightened, Quickened, Seeking, Twinned) with toggles on the spell bar
- Wizard: Arcane Recovery on short rests
- Subclass always-prepared spells (Life Domain, Oath of Devotion, Fiend, Draconic) and the Druid's Circle of the Land choice; Thaumaturge and Magician get their extra cantrip
- Pushes: Thunderwave, Repelling Blast and the Push mastery
- Chromatic Orb picks the damage type the target resists least
- Rules fix: creatures can move through the space of an incapacitated creature (a downed character in a corridor no longer blocks a fight forever)

Class features, round 3:
- Cleric: Disciple of Life, Preserve Life, Channel Divinity's Divine Spark and Turn Undead (turned undead flee until damaged)
- Monk: Unarmored Movement, Uncanny Metabolism (on rolling initiative), Deflect Attacks (automatic reaction, with the Focus Point redirect), Open Hand Technique (Flurry hits topple, or addle the already prone)
- Wizard: Potent Cantrip. Barbarian: Danger Sense, Primal Knowledge (an extra skill in the builder). Fighter: Tactical Mind (a failed story check can spend a Second Wind use for +1d10)
- New spells: Entangle (restrained; break free with an action), Command ("Grovel"), Heroism, Divine Favor, Thunderous, Searing and Wrathful Smite. Smites are cast before the hit and ride on the next melee weapon hit (simpler than the 2024 "cast after you hit" timing)
- Conditions in battle: restrained, frightened, burning
- Story-only features (Thieves' Cant, Druidic, Ritual Adept...) are labeled "story" on the character sheet
- Every class's level 1 to 3 features now work except the Druid's Wild Shape and Land's Aid

Druid:
- Wild Shape: Bonus Action into any bestiary beast up to the level's CR (1/4 at levels 2-3, so the Wolf for now), keeping the druid's HP, mind and features, plus temporary HP equal to the druid level; no spells while shaped; ends with a Bonus Action or at 0 HP; the battle sprite swaps to the beast. Two uses, one back on a short rest
- Land's Aid: 10 ft burst within 60 ft for a Wild Shape use, necrotic to enemies and a heal for the most hurt ally
- AI druids Entangle and Land's Aid groups, and Wild Shape when out of slots or in melee
- More forms arrive with new beast art (batch 2 sections 1 and 6)

All 12 classes now have their level 1 to 3 features in battle.

Not yet:
- Spells above level 2, reactions (Shield, Hellish Rebuke), out-of-combat spells (rituals, utility)
- Command only offers "Grovel"
- Monsters casting spells
- Barbarian Danger Sense, Rogue Fast Hands, Monk Deflect Attacks (these need saves, objects or reactions in battle)
- Companion battle sprites: requested from Codex in batch 2, section 5; the game uses `hero-<character id>` art automatically once it exists

Part 2 (next):
- Real-key playtest with Claude, then tune the prompt using the eval results
- AI image generation (only when the library has nothing that fits), with its own budget

Known limits:
- Combat results are reported by the browser; Phase 6 moves battles to the server for multiplayer
- Only goblins exist as monsters until more content is added

### Art library integration (batch 1)

Done:
- Large creatures: 2x2 footprints for movement, reach, distance, opportunity attacks, line of sight and placement
- New rules: prone (standing costs half speed, melee advantage, ranged disadvantage), attack side effects (wolf knockdown), bonus damage (spider poison), Pack Tactics, Undead Fortitude
- Bestiary: skeleton, zombie, wolf, giant spider, ogre (2024 SRD stat blocks; double-check against the SRD)
- Battle screen loads monster sprites, tilesets and boards from the art catalog; the forest road board is playable
- DM tool `show_art`: scenes and portraits picked by tags, NPCs keep their portrait
- start_combat offers only monsters whose rules and art are both marked ready, and a new forest battlefield
- Balance (`npm run balance -- <count> <monster>`): Bram alone wins vs 2 wolves 98%, 3 zombies 91%, 1 giant spider 84%, 3 skeletons 71%, 1 ogre 38%

Not yet:
- Giant spider Web, Spider Climb and Web Walker
- Monster portraits only appear when the DM asks for them by tags

### Phase 5 progress (leveling and saving)

Done:
- Levels 4 and 5 for every class: Ability Score Improvement (or Alert / Savage Attacker), Extra Attack, Fast Movement, Font of Inspiration, Sear Undead, Wild Resurgence, Tactical Shift, Stunning Strike, Cunning Strike, Uncanny Dodge, Sorcerous Restoration, more weapon masteries, 3rd-level slots
- New spells: Aid, Lesser Restoration, Fireball, Lightning Bolt, Mass Healing Word, Revivify, Spirit Guardians, Vampiric Touch; level 5 subclass spells
- Level-up walkthrough (`packages/content/src/levelup.ts`, `LevelUp.tsx`): average or rolled HP (rolled on the server), ASI or feat, spells, invocations, metamagic, masteries; starts from suggested picks; AI companions level themselves with the same picks
- Player accounts: name + PIN (scrypt-hashed, lockout after 5 wrong tries), device tokens, characters saved per player on the server, adventures owned by the player who started them and listed for continuing on any device; a character that levels up in an adventure is updated in the player's roster. Real sign-in replaces this at deployment, keeping the data
- Every bonus die and discarded reroll is logged

Not yet:
- Levels 6+ (the level cap is `MAX_LEVEL` = 5)
- Monk Slow Fall and Paladin Faithful Steed are story-only
- Feats that need their own choices (Magic Initiate, Skilled) at level 4
- Druid 3rd-level spells

### Phase 6 progress (multiplayer)

Done:
- Shared tables: the host signs in, starts an adventure and clicks Invite friends for a 6-letter code. Friends sign in, open Adventure, enter the code and pick a character. Up to 6 players (`MAX_PLAYERS`).
- Joining is refused during a battle, so players drop in at natural breaks. Stepping away sits your character out of battles at half XP; rejoining with the code brings it back.
- Live table connection (`GET /api/adventures/:id/stream`, server-sent events): the DM's words as they are written, story updates, battle moves, who is online, and whether the DM is busy. One DM request runs at a time per table; others get a clear "wait".
- Battles run on the server (`packages/server/src/battle.ts`). Each player moves only their own character; the computer plays monsters, AI companions and absent players. Everyone at the table is taken to the grid when a fight starts and sees every move. The battle is saved with the adventure, so a restart resumes it.
- Permissions: only the host starts and ends sessions and creates invites; you roll and drink potions only for your own character (companions and absent players' characters are anyone's); strangers get 403.
- The DM's prompt says who plays each character, and narration opens with table news (who joined or stepped away).

Not yet:
- Hosting: friends need to reach the server (a public Codespaces port for testing, or a deployed host such as Railway, Render or Fly)
- Real sign-in (name + PIN is a stand-in)
- Voice chat between players
