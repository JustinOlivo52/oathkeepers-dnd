# Oathkeepers project doc

Everything about the project in one place: design, tech plan, deployment and art. Open Codex jobs stay in their own briefs in `docs/art/` (`CODEX_FIXES_LIBRARY_1.md`, `CODEX_BRIEF_LIBRARY_2.md`, `CODEX_BRIEF_SPELLS.md`).

## Contents

- [Design](#design)
- [Tech plan](#tech-plan)
- [Deployment](#deployment)
- [Art](#art)
- [Art library spec](#art-library-spec)
- [Art production plan](#art-production-plan)
- [Art history: trial brief](#art-history-trial-brief)
- [Art history: trial handoff](#art-history-trial-handoff)
- [Art history: trial notes](#art-history-trial-notes)
- [Art history: batch 1 brief](#art-history-batch-1-brief)
- [Art history: batch 1 notes](#art-history-batch-1-notes)
- [Art history: batch 1 review](#art-history-batch-1-review)

## Design

Status: planning phase. Nothing here is built yet.

### 1. Vision

A browser game that plays like a real D&D 5e campaign. An AI Dungeon Master runs the story, NPCs and world. Combat happens on a pixel-art tactical grid. Play solo or online with up to 6 friends.

### 2. Core decisions (locked)

#### Players and sessions
| Decision | Choice |
|---|---|
| Modes | Single player (true solo or with AI companions) and live online multiplayer |
| Party size | Up to 6 players |
| Session style | Drop in, drop out |
| Campaign | One continuous campaign |
| Absent player | Their character sits out and earns a reduced XP share |
| Joining | Only at natural breaks (scene change, rest, town). Never mid-combat |
| Voice | Speech-to-text for players, text-to-speech for the DM |

#### Dungeon Master
| Decision | Choice |
|---|---|
| Who DMs | AI only for now. Human DM mode is a future feature, so design for it |
| Style | Mix of by-the-book and rule of cool |
| Player freedom | True D&D: players can attempt anything |
| Content | Like a regular D&D campaign. It gets dark when the story calls for it |

#### Rules
| Decision | Choice |
|---|---|
| Edition | 5e 2024 rules (SRD 5.2, CC-BY-4.0) |
| Optional rules | None for now |
| Death | Standard death saving throws |
| Dice | Players click to roll their own |
| Homebrew | Original subclasses inspired by classic 5e subclass concepts, with our own names and features (see section 6) |

#### Characters
| Decision | Choice |
|---|---|
| Creation | Full builder (species, class, background, ability scores) |
| Starting level | 3 |
| Leveling | XP |

#### World and story
| Decision | Choice |
|---|---|
| Setting | The Western Marches (see section 7) |
| Structure | Mix: written key story beats, AI improvises in between |
| Tone | High adventure |
| First adventure | Decide later |

#### Look and feel
| Decision | Choice |
|---|---|
| Art | Pixel art first, possibly hand drawn later |
| Maps | Procedurally generated |
| Audio | Music and sound effects |
| Title | Not final |

#### Practical
| Decision | Choice |
|---|---|
| AI provider | Any capable hosted model to start (Claude, GPT, etc.), local open-source models as backup (see section 5) |
| Hosting | Free tier to start |
| Platform | Browser first, desktop and mobile later |

### 3. How the game plays

#### Exploration and social (outside combat)
1. Lobby: players join, DM recaps the story so far.
2. Scene: DM describes the location. Screen shows the area and party portraits.
3. Players declare actions by typing or speaking.
4. DM decides if a roll is needed. Player clicks to roll, engine applies modifiers, DM narrates the result.
5. Repeat until combat, a rest, travel or the end of the session.

Features:
- NPCs with personality, secrets and memory of the party
- Spotlight rounds so one player does not dominate
- Private DM whispers to a single player
- Group checks, contested checks, passive Perception and Insight
- World map travel, random encounters, hidden areas
- Traps and puzzles
- Short and long rests per 5e rules
- Shops, selling loot, downtime
- Split party support
- Automatic character sheets, inventory, spell slots, quest log, NPC journal
- Guided level-up screen
- Inspiration

#### Combat
- Switches to a tactical grid map
- Players act directly on the board: click to move, pick actions from an action bar, click targets, click to roll
- Text or voice only for creative actions outside the action bar
- Initiative, full 5e action economy (action, bonus action, reaction, movement)
- Monsters use rule-based tactics, not the LLM
- Returns to narration when combat ends

### 4. Key architecture rule

The AI tells the story. The code enforces the rules.

The DM never does dice math or tracks HP. It calls engine functions such as `request_check`, `start_combat`, `grant_xp` or `give_item`, and the rules engine resolves them. All game state lives in the engine, not in the AI's memory.

### 5. AI provider

Build a provider layer so the DM model can be swapped without changing the game.

- Start: whichever hosted model (Claude, GPT, etc.) handles the DM role best. Pick by testing real sessions, mainly on storytelling and calling game functions correctly.
- Backup: open-source models run locally. Explore later, including GPU requirements.

| | Hosted model | Local model |
|---|---|---|
| Cost | Pay per use | Free after hardware |
| DM quality | Strong storytelling and tool use | Usually weaker, varies by model |
| Hardware | None | Needs a strong GPU on the host machine |
| Online play | Works from any server | Host must run the model |

### 6. Party, progression and homebrew

#### Solo play and companions
- At the start of a single player campaign, the player chooses: Solo or With Companions.
- Solo: the adventure is scaled for one adventurer (encounters, puzzles, rewards).
- Companions can be added or dismissed later, at natural breaks. Everything rebalances to the current party.
- Scaling is always calculated from the party present at that moment, never locked at campaign start.
- Solo safety rules (to tune in playtesting), because one bad roll can end a solo run:
  - Fewer, stronger enemies instead of large groups (action economy)
  - Extra protection against "lose your turn" effects (paralyzed, stunned, asleep), such as repeating the save each turn
  - A once-per-rest second chance on a failed death save or a dropped-to-0 moment
- Skill gaps: with no party to cover them, the DM offers alternate paths (no lockpicking means find the key, bribe the guard, break the door).
- Companions: AI-controlled, recruited in the story. They step aside when real players join. Test feature first.

#### Absent players
- Absent characters earn a reduced XP share so the party stays close in level.
- Exact share to be tuned in playtesting.

#### Joining
- Players join only at natural breaks: scene change, rest, town. Never mid-combat.

#### Homebrew subclasses
- SRD 5.2 gives one subclass per class. We add original subclasses to fill out each class.
- Inspired by classic subclass concepts, but with our own names, flavor and features.
- Guardrails: never copy official text, names or feature wording. Write our own features and tweak the mechanics, rather than renaming an existing subclass one to one.

### 7. Setting: The Western Marches

- A frontier kingdom at the edge of a wild, unexplored land full of ruins, dungeons and the remains of old empires.
- Players start from a home-base town, head out on expeditions and come back to rest, trade and plan.
- Built for rotating players: each expedition is a self-contained trip, which fits drop in, drop out.
- Long-running mysteries and story beats tie expeditions into one continuous campaign.
- Tone: high adventure, dark when the story calls for it.

#### Open questions
- Title
- First adventure
- Home-base town, frontier regions and main threat
- Companion design (who they are, how they're recruited)

### 8. Build phases

1. Rules engine: dice, character sheets, checks, attacks, damage, conditions. Tested logic, no visuals.
2. Character builder: full 2024 creation flow.
3. Grid combat: generated map, monsters, turn-based fights.
4. AI DM: narration, NPCs, checks, handoff to and from combat.
5. Single player campaign loop with companions, saves, rests, leveling.
6. Multiplayer: rooms, drop in, drop out, sync.
7. Voice, music and effects.
8. Content waves: all SRD classes, spells, monsters, items.
9. Campaign: setting, story beats, first adventure.

### 9. Legal

Uses the System Reference Document 5.2 by Wizards of the Coast, licensed under CC-BY-4.0. Attribution required in the game. No non-SRD content (no Forgotten Realms, Beholders, Mind Flayers, or "D&D" in the title).

## Tech plan

Status: Phases 1 to 3 done, Phase 4 (AI DM) done except prompt tuning, Phase 5 (leveling to 5, player saves) done, art library batch 1 integrated. See [Design](#design) for the game itself.

### 1. Guiding principles

1. **The engine is the source of truth.** All rules, dice and game state live in the rules engine. The AI DM only narrates and calls engine functions.
2. **The server is authoritative.** Clients send requests ("I attack the goblin"). The server checks them against the rules, applies them and sends everyone the result. No cheating, no desync.
3. **Content is data.** Classes, spells, monsters and items are data files, not hand-written code.
4. **Everything is an event.** Every action is recorded in a game log. The log powers saves, recaps, AI memory and debugging.
5. **Solo and multiplayer use the same system.** Solo play is a room with one player.

### 2. Stack

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

### 3. Packages

```
packages/
  engine/    Rules: dice, checks, combat, conditions, spells, rests, leveling
  content/   SRD 5.2 data + our homebrew, with schemas
  dm/        AI DM: provider layer, prompts, tools, memory
  server/    Rooms, players, saves, event log
  client/    Browser game: Phaser grid + React UI
```

### 4. Rules engine design

- **Effects system:** Most features are modifiers and triggers ("+2 AC while wearing armor", "on hit, deal 1d6 extra"). Defined in data, run by the engine. Rare odd features get small code hooks.
- **Core systems:** ability checks, saves, attacks, damage and resistances, conditions, action economy, spell slots and concentration, rests, death saves, XP and leveling.
- **Dice:** Server-side random rolls. The player's click sends the roll request, and the client shows the dice animation with the real result. Every roll is logged.
- **Encounter scaling:** Built from the party present right now (solo, companions, or up to 6 players), using the per-character XP budget.

### 5. Combat

#### Controls: players act on the board, not by typing
- Click your character to select it. Reachable squares light up.
- Click a square to move. The path and any opportunity attack risk are shown first.
- Action bar: Attack, Dash, Dodge, Disengage, Help, Hide, spells, items, class features. Spent actions grey out.
- Targeting: click an enemy to attack. Range, area templates and affected creatures are previewed before you confirm.
- Click to roll. Dice animate on screen with the real result.
- Reactions pop up when triggered ("Goblin moves away. Opportunity attack?" / "You're hit. Cast Shield?").
- End Turn button. Initiative order shown along the top.

#### Creative actions (optional text or voice)
- For anything outside the action bar ("I kick the brazier onto the goblins", "I swing from the chandelier"), the player types or says it.
- The DM decides the check and the engine resolves it, then the result plays out on the board.

#### DM in combat
- Short narration of big moments (crits, kills, spells), not every move, to keep turns fast.
- Monsters and companions act on the board using rule-based tactics.

#### Rules
- Square grid, 5 ft per square
- Movement, difficult terrain, opportunity attacks, cover, line of sight
- Area templates for spells (cone, sphere, line, cube)
- Monster AI: rule-based tactics (target the wounded, casters stay back, flee when losing)
- Same rule-based approach drives AI companions in combat

### 6. AI DM design

- **Tools the DM can call:** `request_check`, `request_save`, `start_combat`, `grant_xp`, `give_item`, `move_scene`, `whisper_player`, `update_npc`, `add_quest`, and more.
- **Engine validates every call.** The DM cannot change HP, dice or rules directly.
- **Context sent to the DM each turn:** current scene, party summary, recent events, relevant NPCs and quests, campaign story beats.
- **Memory:** After each session, an automatic summary plus updates to the NPC, location and quest records. Old details are looked up when relevant instead of sent every time.
- **Spotlight rounds:** The server gathers player actions in a round before sending them to the DM.

### 7. Maps

- Procedural generation: dungeons (rooms and corridors), caves, wilderness, towns
- Pixel-art tilesets: start with a licensed asset pack, replace with custom art later
- Art trial at the start of Phase 3: Claude builds sample pixel sprites (a character, a goblin, a tile set) with idle, walk and attack animations. Justin compares the result against Codex and asset packs before choosing the art source.
- All rendering code uses a standard sprite sheet format, so the art source can change without code changes
- The DM can ask for a map by type and theme ("ruined chapel, small, overgrown")

### 8. Multiplayer

- Rooms with invite links, up to 6 players
- Drop in at natural breaks only. The server holds joiners in a waiting state until the next break.
- Reconnects keep your seat if you drop mid-session
- Text and voice input, DM narration read aloud

### 9. First milestone (Phase 1)

The rules engine, tested, with no visuals:
- Dice and roll notation (`2d6+3`, advantage, disadvantage)
- Ability scores, modifiers, proficiency
- Ability checks and saving throws
- One class (Fighter) and one monster (Goblin) as data
- A text-only combat between them that runs to completion in tests

Done when: a Fighter vs Goblin fight runs start to finish in tests, following 5e rules, with every roll logged.

#### Phase 1 progress

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

#### Phase 2 progress (character builder)

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

#### Phase 3 progress (grid combat)

Done:
- Art trial: Claude's text-drawn pixel sprites vs Codex's image-generated art; Codex's art was chosen (see [Art](#art))
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

#### Phase 4 progress (AI Dungeon Master)

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

#### Art library integration (batch 1)

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

#### Phase 5 progress (leveling and saving)

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

#### Phase 6 progress (multiplayer)

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

## Deployment

One server runs everything: the game pages, the API, the AI DM and the shared tables.
`Dockerfile` builds it. Any host that runs a Docker container and keeps a disk works.

### What the server needs

| Setting | What it's for |
| --- | --- |
| `ANTHROPIC_API_KEY` | The AI DM. Set it in the host's secret settings, never in a file in the repo. |
| `GROUP_CODE` | Required before going public. New players need it to make an account, and only signed-in players get the AI DM. |
| `DM_MONTHLY_BUDGET_USD` | Spending cap. The server stops calling Claude when it's reached. Start with 10 to 20. |
| `DATABASE_URL` | Postgres connection string. Saves go to the database. Without it the server writes JSON files to `DATA_DIR`, which needs a persistent volume on a host. |
| `DATA_DIR` | Save folder when there's no database. Already `/data` in the image. On the first start with a database, saves found here are copied in. |
| `PORT` | Already 8080 in the image. Most hosts set it for you. |

Run exactly **one** copy of the server. Live tables are held in memory, so two copies would split the players.

### Render (recommended)

`render.yaml` sets up the web service (Docker build, health check, autodeploy from `master`) and a Postgres database, and connects them with `DATABASE_URL`. Starter web plan so it doesn't sleep; check current prices on Render before applying.

1. render.com: sign in with GitHub, New, Blueprint, pick `oathkeepers-dnd`. It reads `render.yaml`.
2. It asks for `ANTHROPIC_API_KEY` and `GROUP_CODE`. `DM_MONTHLY_BUDGET_USD` defaults to 20; change it under Environment.
3. Apply. The URL (`https://oathkeepers-xxxx.onrender.com`) is on the service page.
4. Every push to `master` redeploys.

### Railway

Not taking new users as of 2026-10. `railway.json` is ready if that changes: deploy from the GitHub repo, add the same variables, attach a volume at `/data`, generate a domain.

### Check it works

- Open the URL: the game loads, and `/api/health` shows `"providers":["claude","demo"]` and `"groupCode":true`.
- Sign in with a new name: it asks for the group code.
- Start an adventure with Claude, invite a friend from another device, play one fight together.
- Redeploy, then continue the adventure: it's still there (saves are in Postgres).

### Try the production build locally

```bash
npm run build
DATA_DIR=./tmp-data GROUP_CODE=test npm start   # save files, http://localhost:8787
DATABASE_URL=postgres://user:pass@localhost:5432/oathkeepers npm start   # Postgres
```

Storage tests run against Postgres too when `TEST_DATABASE_URL` is set (its tables get dropped):

```bash
TEST_DATABASE_URL=postgres://user:pass@localhost:5432/oath_test npm test
```

### Still to do before a wider launch

- Real sign-in (name + PIN is a stand-in; the group code keeps it to people you invite)
- Database backups (Render's paid Postgres plans include them; check retention)

## Art

Current art: **Codex art trial** (chosen over Claude's first pass). Preview: [`art-trial-codex.png`](art/art-trial-codex.png).
Claude's original 16x16 version is kept for reference in [`art-trial.png`](art/art-trial.png).

### How it's made

1. Original artwork is generated with an image model (Codex used image generation).
2. The raw images live in `packages/web/art/codex/source/`.
3. Python scripts in `packages/web/art/codex/` crop, clean transparency, line up each frame and pack the sprite sheets. They don't draw anything.
4. Rebuild with `npm run sprites -w @oathkeepers/web` (needs Python 3 and Pillow: `pip install pillow`).

The old text-art exporter is still in `packages/web/scripts/export-legacy-sprites.ts`. Running it overwrites the current sheets with Claude's original art.

### Sheet format

Everything the game loads is in `packages/web/public/assets/sprites/`.

| Sheet | Frames | Size |
|---|---|---|
| `hero-martial.png`, `hero-expert.png`, `hero-arcane.png`, `hero-divine.png`, `goblin.png` | 11, left to right | 192x192, feet at (96, 166) |
| `tiles.png` | floor x3, wall, rubble | 128x128 |
| `props.png` | brazier, column, arch, ivy (2x2 grid) | 128x128 |

Character frames: 0-1 idle, 2-5 walk, 6-8 attack (wind up, swing, follow through), 9 hit, 10 down. Characters face right and are mirrored to face left.

`sprites.json` lists each sheet's frame size and animations. Sheet names and animation names (`idle`, `walk`, `attack`, `hit`, `down`) must stay the same for the game to load new art without code changes.

The battle board draws each square at 96 world pixels (`TILE` in `packages/web/src/battle/scene.ts`).

### Known gaps

- Only left and right facing; no up or down sheets
- One attack animation per hero type; no separate bow, thrown or spell animations
- Every new monster needs its own sheet
- Purely AI-generated images generally can't be copyrighted in the US. Fine for a game among friends; revisit before anything commercial.

### Art library

Batch 1 pilot (5 monsters, 8 portraits, 2 scenes, forest board) is integrated and marked ready in the catalog.

All new art goes into the tagged art library: see [Art library spec](#art-library-spec). Batch 1 brief: [batch 1 brief](#art-history-batch-1-brief).

### Requesting new art

Use [batch 1 brief](#art-history-batch-1-brief) as the template: name the sheets, frames, size and style, work on a branch, and have the result tested in the browser before it's merged.

## Art library spec

The game uses a library of **premade, reviewed art**. The AI Dungeon Master never draws anything during play. It asks for art by **tags** ("tavern, night"), and the game picks the best match from the library. Among equally good matches it picks at random, and it avoids repeating recent images.

AI image generation is the backup only: when nothing in the library fits (a unique villain, say), one image is generated, reviewed, and **added to the library** so it gets reused.

### Folder layout

Everything the game loads is in `packages/web/public/assets/`.

```
assets/
  sprites/                      battle sprite sheets (heroes, monsters) and tilesets
    monster-<id>.png
    tiles-<id>.png
    props-<id>.png
  library/
    portraits/<id>.webp         NPC, monster and player portraits
    scenes/<id>.webp            location backdrops
    cards/<id>.webp             character builder cards (classes, species)
  boards/<id>.json              hand-made battle boards
```

The catalog that lists every asset is `packages/content/data/art-catalog.json`. An image that isn't in the catalog doesn't exist as far as the game is concerned.

### Asset types

| Kind | What it is | Format | Size |
|---|---|---|---|
| `hero` | Player character battle sprite | PNG, transparent | 11 frames of 192x192 in one row |
| `monster` | Monster battle sprite | PNG, transparent | Medium: 11 frames of 192x192. Large: 11 frames of 384x384 |
| `npc` | Portrait shown in the story | WebP, quality about 85 | 512x512, under 150 KB |
| `scene` | Location backdrop shown in the story | WebP, quality about 85 | 1600x900, under 400 KB |
| `tileset` | Terrain tiles for battle boards | PNG | 5 frames of 128x128: floor x3, wall, difficult terrain |
| `board` | A hand-made battle map | JSON (see below) | 18 to 26 squares wide, 12 to 16 tall |
| `vfx` | Spell effect animation | PNG, transparent | Projectile 4 x 64x64, impact 8 x 192x192, area 8 x 384x384 (see `CODEX_BRIEF_SPELLS.md`) |
| `icon` | Spell button icon | PNG | 64x64 |
| `portrait` | Player character portrait for the builder's picker (species, archetype and presentation tags) | WebP, quality about 85 | 512x512, under 150 KB |
| `card` | Builder card for one class (`classId`) or species (`speciesId`) | WebP, quality about 80 | 768x512, under 150 KB |

Monsters can also have a portrait (an `npc`-style still image) listed as a separate `npc` entry with the monster's creature tags.

#### Battle sprite frames

Frames go left to right in one row. Characters **face right** (the game mirrors them to face left).

| Frames | Animation |
|---|---|
| 0-1 | idle |
| 2-5 | walk |
| 6-8 | attack: wind up, strike, follow through |
| 9 | hit (recoil) |
| 10 | down (lying on the ground) |

- **Medium:** feet at pixel (96, 166) in every frame
- **Large:** feet at pixel (192, 340) in every frame
- Keep the same pixel density across all sprites, so a Large ogre looks twice the size of a Medium goblin
- Nothing may touch the frame edge, and the background must be fully transparent

#### Board JSON

```json
{
  "id": "forest-road",
  "name": "Forest Road",
  "tileset": "tiles-forest",
  "rows": [
    "######################",
    "#....~~.......#......#",
    "..."
  ],
  "props": [{ "x": 4, "y": 2, "prop": 0 }],
  "partySpawns": [{ "x": 2, "y": 7 }],
  "enemySpawns": [{ "x": 18, "y": 6 }]
}
```

- `#` wall (blocks movement and sight), `.` floor, `~` difficult terrain (costs double movement)
- At least 6 party spawns and 8 enemy spawns, all on open squares, with enough distance between the groups to matter
- `prop` is a frame number in the tileset's props sheet (decorations only; they don't change the rules)
- Every open square must be reachable from the party spawns

### Catalog entries

```json
{
  "id": "scene-tavern-night",
  "kind": "scene",
  "title": "The Lantern tavern at night",
  "tags": ["tavern", "town", "night", "indoor", "festive"],
  "image": "library/scenes/tavern-night.webp",
  "source": "codex-imagegen",
  "added": "2026-10-22"
}
```

| Field | Used by | Meaning |
|---|---|---|
| `id` | all | Unique, lowercase with dashes |
| `kind` | all | `hero`, `monster`, `npc`, `scene`, `board`, `tileset`, `vfx`, `icon` |
| `title` | all | Short human description |
| `tags` | all | From the vocabulary below only; 3 to 8 per entry (none needed for `vfx` and `icon`, which are found by id) |
| `sprite` | hero, monster | `{ file, frameWidth, frameHeight, size, rulesSize, footprint, anchor, visibleHeight }`; `visibleHeight` is pixels from the feet to the top of the idle pose |
| `monsterId` | monster | The bestiary id, for example `goblin-warrior` |
| `image` | npc, scene, icon | Path under `assets/` |
| `vfx` | vfx | `{ file, frameWidth, frameHeight, frames, fps, role }`, role `projectile`, `impact` or `area` |
| `board` | board | Path to the board JSON |
| `tiles` | tileset, board | Tileset: path to its PNG. Board: the tileset's catalog id |
| `source` | all | `codex-imagegen`, `claude-code`, `commissioned`, or `ai-generated-in-game` |
| `added` | all | Date added, `YYYY-MM-DD` |

### Tag vocabulary

Only these tags are allowed. The tests reject anything else, which keeps matching reliable. To add a tag, add it to `ART_TAGS` in `packages/content/src/art.ts` and to this list.

| Group | Tags |
|---|---|
| place | town, tavern, temple, market, smithy, gate, road, forest, river, farm, ruins, abbey, cave, crypt, camp, hills, mountain, watchtower, dungeon, swamp |
| time | day, night, dusk, dawn |
| weather | clear, rain, fog, snow, storm |
| mood | calm, tense, eerie, hostile, festive, somber |
| setting | indoor, outdoor, underground |
| creature | humanoid, goblinoid, beast, undead, monstrosity, giant, fiend, swarm |
| role | innkeeper, guard, captain, merchant, priest, noble, farmer, smith, scholar, thief, bandit, cultist, hunter, elder, child, soldier, mage, bard, healer, villain, hero |
| species | human, elf, dwarf, halfling, gnome, dragonborn, tiefling, orc, goliath |
| presentation | man, woman, androgynous |
| attitude | friendly, neutral, sinister |
| combat | brute, skirmisher, archer, caster, leader, minion |
| archetype | martial, expert, arcane, divine |

### Rules for all art

- **Original work only.** SRD monsters and ideas are free to use, but official D&D artwork is not. No copying, tracing or imitating book art, and no prompts naming artists or "official D&D style."
- **SRD monsters only.** Nothing from outside the SRD 5.2 (no Beholders, Mind Flayers, Displacer Beasts and so on).
- **One style.** Match the existing Codex art: detailed 2D fantasy, dark outlines, warm torchlit palette, readable at game size.
- **No text or watermarks** in images.
- **Mature but not graphic.** Dark fantasy is fine; no gore close-ups or sexual content.
- **Reviewed before it ships.** New art goes on a branch, passes `npm test` (which checks the catalog), and is looked at in the running game before merging.

### How the game uses it

- **Battles:** monster sprites by `monsterId`; boards by tags (`cave`, `forest`).
- **Story:** the DM calls a tool to show a scene or a character, passing tags. The game shows the best match next to the narration.
- **Code:** `pickArt(catalog, { kind, tags, monsterId, exclude }, rng)` in `packages/content/src/art.ts`.

### Library 1 policy update (2026-10-22)

These rules supersede conflicting examples above. The catalog is a development inventory as well as a runtime library: an asset may exist in the catalog before it is usable in the game.

#### Three independent readiness fields

- `artStatus`: `draft` or `ready` (source and exported art inspected).
- `mechanicsStatus`: `pending`, `ready`, or `not-required` (only non-monsters may use `not-required`).
- `integrationStatus`: `pending` or `ready` (runtime mapping and browser playthrough complete).

Missing fields default to draft/pending/pending. `integrationStatus: ready` requires ready art and supported mechanics. `isEncounterReady()` requires all applicable gates. Existing shipped assets have explicit ready values. New pilot assets remain integration-pending; monster mechanics remain pending until Claude implements their exact stat blocks and abilities.

A monster's `monsterId` is required even for art-first work. It must resolve to a bestiary entry when mechanics are marked ready. Pending monster art is allowed without a stat block. Tests must not force placeholder creature rules just to admit artwork.

#### Matching and identity

`pickArt()` defaults to encounter-ready assets. Location, setting, time, species and creature tags in `tags` are mandatory constraints; other tags are ranking preferences. `requiredTags` adds further mandatory constraints. Unknown tags or no compatible match return `undefined`; the caller can omit the illustration or choose an explicit narrative fallback, never display unrelated art silently.

Match quality is decided before recent-image avoidance. Repetition avoidance happens only among equally suitable images. Repeating the correct crypt is preferable to a fresh tavern. `assetId` preserves a previously selected identity; save selected asset IDs with adventures/NPCs to prevent appearance changes. The selector supports this pinning but save/UI integration remains Claude's task.

`readiness: art-ready` explicitly enables development review of reviewed but unintegrated assets. Do not expose this option to the DM during normal play.

#### Drawing size is not rules size

The legacy `sprite.size` describes the canvas format only. Use independent fields:

```json
{
  "file": "sprites/monster-ogre.png",
  "frameWidth": 384,
  "frameHeight": 384,
  "size": "large",
  "rulesSize": "large",
  "footprint": { "width": 2, "height": 2 },
  "anchor": { "x": 192, "y": 340 }
}
```

Small and Medium creatures normally occupy1x1; Large2x2; Huge3x3; Gargantuan minimum4x4. The existing goblin is rules-size Small despite its192px canvas. Do not scale all creatures from frame width alone or assume every monster has humanoid height. Creature tags describe art matching, not authoritative rules taxonomy. `swarm` means an actual swarm depiction, not a single rat.

A larger atlas does not implement occupancy, reach, movement clearance, targeting or area effects. Runtime `pickArt` allows only1x1 sprites unless the caller explicitly supplies `maxFootprint` after engine/renderer support exists. New Large pilot assets are NOT encounter-ready.

#### Board validation

The schema checks rectangular rows, open and distinct party/enemy spawns, at least3 squares of separation between opposing1x1 anchors, in-bounds props and reachability of every open tile using the engine's existing diagonal/corner rules.

Boards default to `supportedFootprints: ["1x1"]`. Declaring2x2 support requires `largePartySpawns` and `largeEnemySpawns`, each anchor having a clear2x2 area; Large slots cannot overlap each other and must connect through a2x2-clear route. Opposing Large anchors must be at least4 squares apart. Large spawn lists are alternative placement layouts; a runtime allocator must still prevent collisions when mixing creature sizes. This validator is asset geometry checking, not an implementation of Large-creature combat.

Board catalog `tiles`, board JSON `tileset`, and the referenced tileset catalog ID must agree. Optional `props` on the tileset entry names its raster props sheet.

#### Player artwork

Player appearance needs a separate compatible-body/equipment specification. The four existing hero sheets remain generic defaults. This batch does not implement layered character customization.

Monster portraits also carry `monsterId`, so a skeleton encounter can request its actual skeleton portrait rather than any image tagged undead. Use `assetId` for a specific saved NPC. Reviewed scene/portrait art can be reused across stories after its integration gate is passed; the monster's underlying combat support is a separate decision.

## Art production plan

Status: proposed production plan, not an implemented asset-selection service or completed monster catalog.

### Agreed direction

Build original, preapproved detailed 2D fantasy artwork in advance. Runtime encounters assemble compatible assets from a catalog rather than waiting for new sprite generation. Codex handles art production and visual review; Claude Code remains lead developer and handles catalog integration, rules and encounter assembly. GitHub assets and documentation carry context between development sessions.

Keep the chosen Fallen Abbey / Lanternwood visual direction: natural character proportions, readable equipment, textured stone and foliage, restrained tactical overlays. Treat original generated images as source artwork requiring inspection and registration, not automatically production-ready animation.

### Scope of "all monsters"

Start with a version-pinned roster from the project's SRD 5.2 rules baseline; use the official SRD 5.2.1 source to inventory corrections and record any version migration explicitly. Do not silently change existing rules or import every published Monster Manual or setting-specific creature. Official source: https://www.dndbeyond.com/srd

Before forecasting totals, enumerate actual stat blocks and group them into distinct visual designs. Stat-block count, species count, age variants, equipment variants and unique animated bodies are different numbers. Include beasts, NPC stat blocks, swarms and summoned forms in the scope decision. Large creatures and multi-square footprints require explicit renderer AND rules support, not merely larger PNGs.

### Library organization

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

### Runtime selection

DM supplies structured encounter intent and valid creature ids. Code filters assets by compatibility, readiness, biome, footprint and rules support, then chooses among suitable variants with seeded randomness. Persist selected ids and layout in the adventure save for reproducibility.

Only creatures with BOTH validated mechanics and approved art may enter combat automatically. An art-ready dragon is not playable while flight, breath weapons, area effects or its footprint remain unsupported. If no compatible asset exists, select a supported alternative or defer that encounter; never invent an asset path.

### Readiness stages

1. Cataloged: source entry and scope verified.
2. Design approved: silhouette, palette, size and portrait/reference approved.
3. Animation draft: required poses generated.
4. Art ready: transparency, frame bounds, consistent scale, anchors and motion reviewed.
5. Mechanics ready: stat block, features, movement and tactics supported and tested.
6. Integrated: art mapped to actual events, size and facing.
7. Encounter ready: browser playtest passed, including attack, damage and defeat.

Track art and mechanics independently. Do not mark a creature playable just because its sheet exports.

### Workload scenarios

Existing sheet format: 11 frames per creature, one source facing mirrored left/right, one attack. This is a starter format, not a complete animation library.

Illustrative arithmetic only; these are NOT verified SRD roster counts:
- 50 unique designs x 11 = 550 starter frames.
- 150 unique designs x 11 = 1,650 starter frames.
- 300 unique designs x 11 = 3,300 starter frames.
- Four separately authored facings at the same baseline would make the 300-design example 13,200 frames before extra attacks, flight, casting, transformations or smoother in-betweens. Mirroring compatible facings can reduce actual drawn views.

Difficulty varies dramatically. A humanoid melee attacker is simpler than a winged dragon, deforming ooze, swarm or multi-form boss. Equipment and palette variants can reuse a base where visually honest; a wolf, spider, skeleton and dragon need different bodies and motion.

Generating a candidate atlas may be quick. Consistency repair, registration, coherent pose transitions, reruns, actual attack-event matching and browser testing determine production throughput. No reliable full-roster completion date or generation budget exists yet. Treat a polished complete bestiary as a sustained production program rather than a single bulk-generation run.

### Calibration pilot

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

### Release approach

A. Establish catalog schema, art guide and readiness checks.
B. Complete the representative pilot and measure throughput.
C. Release a first regional collection of roughly 20-30 approved encounter-ready creature designs plus forest/town/ruin/cave art.
D. Expand by body family and campaign tier, tracking progress against the full scoped roster.
E. Fill rare bosses and special movement/attack sets after their engine support exists.

The goal can be full prebuilt coverage while releasing useful reviewed collections progressively. Do not block the game on finishing every possible creature.

### Immediate handoff for Claude Code

Review this proposal before implementation. Keep existing saves and asset paths compatible. Add catalog validation and readiness gating before changing the DM's encounter-selection contract. Preserve the current rule: AI narrates and proposes; the engine validates and resolves.

No live image-generation API, provider credential, spending approval, catalog implementation or mass art batch was created by this planning change.

## Art history: trial brief

You are redoing the **pixel artwork** for Oathkeepers, a browser D&D 5e (2024 rules) tactics game. Claude already made a first version. The goal is to see what you can produce so the owner can compare the two and pick an art source.

**Work on a separate branch** (`art/codex-trial`), not `master`, so both versions can be compared side by side.

### What exists now

- Grid battle screen in Phaser 3 (`packages/web/src/battle/`)
- Claude's sprites, drawn as text in `packages/web/art/sprites.ts` and exported by `packages/web/scripts/export-sprites.ts`
- Exported sheets in `packages/web/public/assets/sprites/`
- Preview of Claude's version: `docs/art/art-trial.png`
- Format notes: [Art](#art)

### What to make

The same set of sheets, with the same names, so the game loads them with **no code changes**.

| Sheet | Contents |
|---|---|
| `hero-martial.png` | Armored hero, red accents (Fighter, Barbarian, Monk) |
| `hero-expert.png` | Same hero, green accents (Rogue, Ranger, Bard, Druid) |
| `hero-arcane.png` | Same hero, blue accents (Wizard, Sorcerer, Warlock) |
| `hero-divine.png` | Same hero, gold accents (Cleric, Paladin) |
| `goblin.png` | Goblin warrior with a scimitar |
| `tiles.png` | Dungeon floor (3 variants), wall, rubble (difficult terrain) |

Optional, if you have time: distinct hero silhouettes per group (for example a robe and staff for arcane, a hood for expert) instead of only a color swap.

#### Animation frames (characters)

Frames laid out left to right in one row. Characters **face right**.

| Index | Frame |
|---|---|
| 0-1 | idle (breathing) |
| 2-5 | walk cycle |
| 6-8 | attack: wind up, swing, follow through |
| 9 | hit (recoil) |
| 10 | down (lying on the ground) |

#### Tiles

`tiles.png` frames: 0-2 floor variants, 3 wall, 4 rubble. Floors must tile seamlessly next to each other.

### Technical rules

- **Frame size:** 16x16 is what the game uses now. You may use 32x32 if it looks clearly better: update `frameWidth` and `frameHeight` in `sprites.json`, and change `ART_SCALE` in `packages/web/src/battle/scene.ts` from `TILE / 16` to `TILE / 32`. That is the only code change allowed.
- **Format:** PNG with transparency. No anti-aliasing, hard pixel edges.
- **Manifest:** keep `packages/web/public/assets/sprites/sprites.json` valid. Sheet names, animation names (`idle`, `walk`, `attack`, `hit`, `down`) and the tiles `named` entry must stay the same.
- **Readability:** sprites are drawn at 48 px per grid square on a dark dungeon floor. They must read clearly at that size, including the weapon.
- **Style:** classic fantasy, high adventure tone. Limited palette, dark outlines.
- **Licensing:** original work only. No copying or tracing existing sprites, games or asset packs, and nothing based on official D&D artwork.
- **Do not change** the rules engine, content data, or battle logic.

### Deliverables

1. The six PNG sheets and an updated `sprites.json` in `packages/web/public/assets/sprites/`
2. A preview image at `docs/art/art-trial-codex.png` with every frame of every sheet, scaled up, in the same layout as `docs/art/art-trial.png`
3. A short note in `docs/art/CODEX_NOTES.md`: how you made the art (code, image generation, or by hand), the frame size, and anything you'd improve with more time
4. Checks pass: `npm install`, `npm test`, `npm run typecheck`, `npm run build`

### How to see it in the game

```sh
npm install
npm run dev
```

Open http://localhost:5173, go to **Battle**, and start a battle. Every hero color can be seen by building characters of different classes in **Character Builder**.

### Comparison scorecard (for the owner)

Rate each 1 to 5 for Claude's version (`master`) and Codex's version (`art/codex-trial`).

| | Claude | Codex |
|---|---|---|
| Readable at game size (can you tell what everything is?) | | |
| Weapon visible during attacks | | |
| Animation smoothness (idle, walk, attack) | | |
| Hero vs goblin clearly different at a glance | | |
| Tiles look good next to each other | | |
| Overall style and appeal | | |
| Followed the format with no code breakage | | |
| **Total** | | |

## Art history: trial handoff

### Branch and agreed direction

Work is on `art/codex-trial`; master is unchanged. The owner selected the detailed 2D fantasy character style of the Fallen Abbey concept and the spacious tactical presentation of Lanternwood Crossing. The owner explicitly authorized larger art than the original 16x16/32x32 brief.

### Implemented

- Four distinct hero designs: crimson sword/shield fighter, green hooded expert, blue-robed staff caster, gold/ivory mace-and-shield divine hero.
- Detailed goblin warrior with scimitar and buckler.
- Character sheets: 11 horizontal 192x192 RGBA frames; feet registered at (96,166). Visible standing hero height is approximately128px; goblin approximately95px.
- Original animation contract preserved: idle0-1, walk2-5, attack6-8 with return to0, hit9, down10. Attack playback is8fps.
- Terrain: three slate/moss floor variants, raised masonry wall, rubble; five128x128 frames in tiles.png. Transparent props atlas: brazier,column,arch,ivy in a2x2 grid of128px cells.
- Renderer:96 world pixels per5ft square, independent character foot origin, updated depth/HP placement, wheel zoom, Shift/right/middle drag pan, keyboard camera controls, Find hero and Whole map buttons.
- Battle-only dark/brass presentation with initiative art, compact action dock, health meter, collapsible encounter setup and battle journal.
- New authored Abbey ruins encounter board with broad routes, cross-passages, solid columns and difficult terrain. Generated dungeon remains selectable. Rules engine and content data are unchanged.
- Stable battle component key replaces the previous random key.

### Files and rebuilding

Runtime images and manifest: `packages/web/public/assets/sprites/`.
Original generated artwork and registration scripts: `packages/web/art/codex/`.
Contact sheet: `docs/art/art-trial-codex.png`.

Run `npm run sprites -w @oathkeepers/web` to rebuild from preserved generated raster originals. Requires Python3 and Pillow. Scripts crop, clean alpha, resize with nearest-neighbor sampling, register and repack; they do not illustrate sprites. The old text-art exporter is retained as `packages/web/scripts/export-legacy-sprites.ts`. Do not run it over the new runtime sheets unless deliberately restoring Claude's old artwork.

### Validation status and remaining work

Dependency installation succeeded using a writable npm cache. Before integration, the repository baseline passed86 tests, typecheck and production build. The new asset build completed and validated55 nonempty, transparent character frames with no frame-edge clipping, plus5 terrain frames. An intermediate renderer/UI typecheck passed. Final integrated checks and browser playtesting were interrupted before completion; do not treat this branch as browser-verified or production-ready.

Review camera initialization/resizing, movement selection after zoom/pan, attack confirmation and damage/down playback, generated dungeon mode, all four hero appearances, small screens and missing-asset behavior. The local changes need final integrated test/typecheck/build checks and a visual playthrough.

### Known limits

This is a first integrated art pass, not a complete animation library. Art faces right and is mirrored horizontally; north/south directional sheets are not present. Each archetype has one attack sequence; individual weapons, ranged attacks, unarmed attacks and spells do not yet have bespoke animations. Caster art currently accompanies the existing generic attack events. Idle movement is modest. Terrain crack patterns are not mathematically periodic; grout conceals most seams. Minor prop alpha specks may need cleanup. The board is modular generated raster artwork, not the fully painted concept screenshot; compare the actual running game rather than assuming screenshot fidelity. No live deployment was requested or performed.

## Art history: trial notes

Original artwork was generated with Image Gen, then cropped, alpha-cleaned, registered and repacked with Python/Pillow. Character frames are192x192 with feet at96,166; terrain frames are128x128. Four hero silhouettes replace the old color swaps. The owner authorized larger art and board presentation changes beyond the original brief.

See [Claude handoff](#art-history-trial-handoff) for implementation, rebuilding, validation status and remaining animation work. Individual weapon/spell sequences, north/south directions, smoother in-betweens and final browser review remain follow-up work.

## Art history: batch 1 brief

You are adding the first batch of the **Oathkeepers art library**: premade art the AI Dungeon Master picks from by tags during play. Read [Art library spec](#art-library-spec) first. It defines the folders, formats, sizes, catalog fields, the allowed tags, and the content rules. This brief lists what to make.

### Active scope: representative pilot first

The owner approved a smaller complete pilot and the policy fixes in the [Art library spec](#art-library-spec) before the original full batch. The rest of this document is the expansion backlog; its original all-assets checklist does not define pilot completion.

Pilot deliverables:
- Five monster sheets and matching portraits: skeleton, zombie, wolf, giant-spider, ogre.
- Three NPC portraits: npc-innkeeper-dwarf, npc-guard-captain, npc-merchant.
- Two scenes: scene-forest-road-day, scene-tavern-night.
- One forest tileset and board-forest-road, with validated spawn/routes.
- Preserved originals, reproducible processing, contact-sheet preview, review viewer and handoff notes.

Add each with explicit readiness fields. Static art inspection may mark art ready. New monster mechanics and runtime integration stay pending. Do NOT add invented/minimal stat blocks merely to pass catalog tests. Large artwork does not authorize Large combat support. Normal runtime selection must not choose pending entries.

The owner also authorized catalog, matching and board-validator changes despite the original art-only instruction below. Engine rules and existing stat blocks remain unchanged.

### How to work

1. Pull the latest `master`, then create the branch **`art/library-batch-1`**.
2. Make the assets in the existing Codex style (see `docs/art/art-trial-codex.png`): detailed 2D fantasy, dark outlines, warm torchlit palette.
3. Keep your raw generated images and processing scripts in `packages/web/art/codex/`, as before.
4. Add a catalog entry for every asset to `packages/content/data/art-catalog.json`.
5. Before you hand off, run all four checks and make sure they pass: `npm install`, `npm test`, `npm run typecheck`, `npm run build`. `npm test` fails if a catalog entry points at a missing file or uses a tag outside the vocabulary.
6. Commit and **push the branch**. Last time the work didn't reach GitHub until it was pushed by hand.
7. Write `docs/art/CODEX_NOTES_LIBRARY_1.md`: what you made, how, anything skipped, and anything that needs review.

Work in the order below and push after each section. If you run out of time, a finished smaller set is better than everything half done.

**Don't change** the rules engine, the content stat blocks, or the game code. Claude adds the monster stat blocks and hooks the art into the game after review.

### 1. Monster battle sprites (highest priority)

Each one: an 11-frame sprite sheet at `assets/sprites/monster-<id>.png`, plus a 512x512 portrait at `assets/library/portraits/monster-<id>.webp` listed as a separate `npc` entry with id `portrait-<id>`.

All are SRD 5.2 creatures. Each sheet's catalog entry uses `kind: "monster"` and `monsterId: "<id>"`. Claude will add the matching stat blocks.

| id | Monster | Size | Tags (use these) | Notes |
|---|---|---|---|---|
| goblin-boss | Goblin Boss | Small (192px canvas) | goblinoid, humanoid, leader | Bigger, better armor than the goblin warrior; crude crown or trophy |
| bugbear-warrior | Bugbear Warrior | Medium | goblinoid, humanoid, brute | Hulking, long arms, morningstar |
| bandit | Bandit | Medium | humanoid, bandit, skirmisher | Hooded, light armor, scimitar |
| bandit-captain | Bandit Captain | Medium | humanoid, bandit, leader | Long coat, two blades |
| cultist | Cultist | Medium | humanoid, cultist, caster | Dark robes, ritual dagger, no real-world religious symbols |
| skeleton | Skeleton | Medium | undead, minion | Rusted shortsword, shield fragment |
| zombie | Zombie | Medium | undead, brute | Shambling; keep it grim, not gory |
| ghoul | Ghoul | Medium | undead, skirmisher | Gaunt, long claws |
| wight | Wight | Medium | undead, leader | Corroded armor, cold glowing eyes |
| wolf | Wolf | Medium | beast, skirmisher | Grey wolf, side view |
| giant-rat | Giant Rat | Small (192px canvas) | beast, minion, skirmisher | Scale it small inside the 192 frame |
| harpy | Harpy | Medium | monstrosity, skirmisher | Wings and talons; tasteful design |
| dire-wolf | Dire Wolf | **Large** | beast, brute | Huge, dark fur |
| worg | Worg | **Large** | beast, monstrosity, brute | Evil-eyed, matted fur |
| giant-spider | Giant Spider | **Large** | beast, eerie | Hairy, readable leg pose in every frame |
| brown-bear | Brown Bear | **Large** | beast, brute | |
| owlbear | Owlbear | **Large** | monstrosity, brute | Original design: owl head and beak on a bear body |
| ogre | Ogre | **Large** | giant, brute | Club, crude hides |

For animals, "attack" is a bite or claw lunge; "walk" is a four-legged gait. Large sheets are 384x384 frames with feet at (192, 340).

### 2. NPC portraits

512x512 WebP at `assets/library/portraits/<id>.webp`, catalog `kind: "npc"`. Chest-up, three-quarter view, a simple painted background that fits the role. Mix species and genders as listed; give each a distinct face.

| id | Who | Tags |
|---|---|---|
| npc-innkeeper-dwarf | Cheerful dwarf innkeeper | innkeeper, dwarf, woman, friendly, tavern, indoor |
| npc-innkeeper-human | Weary human innkeeper | innkeeper, human, man, neutral, tavern, indoor |
| npc-guard-captain | Scarred guard captain | captain, guard, soldier, human, woman, neutral |
| npc-town-guard | Young town guard | guard, soldier, halfling, man, friendly, gate |
| npc-merchant | Shrewd traveling merchant | merchant, gnome, man, neutral, market |
| npc-blacksmith | Frontier blacksmith | smith, goliath, woman, friendly, smithy |
| npc-priest | Kindly temple priest | priest, healer, human, man, friendly, temple |
| npc-priestess-dark | Severe priestess with secrets | priest, elf, woman, sinister, temple |
| npc-noble | Frontier lord | noble, human, man, neutral |
| npc-farmer | Worried farmer | farmer, human, woman, friendly, farm |
| npc-scholar | Absent-minded scholar | scholar, mage, gnome, woman, friendly |
| npc-hunter | Grizzled hunter and tracker | hunter, elf, man, neutral, forest |
| npc-thief | Charming pickpocket | thief, tiefling, woman, neutral, town |
| npc-bard | Traveling orc bard | bard, orc, man, friendly, tavern |
| npc-elder | Village elder | elder, halfling, woman, friendly, town |
| npc-child | Curious street child | child, human, androgynous, friendly, town |
| npc-mage | Mysterious hedge wizard | mage, dragonborn, man, sinister |
| npc-soldier-veteran | One-armed veteran soldier | soldier, dwarf, man, friendly |
| npc-cult-leader | Cult leader (villain) | cultist, villain, human, woman, sinister |
| npc-bandit-leader | Bandit chief (villain) | bandit, villain, orc, man, hostile |

### 3. Scene backdrops

1600x900 WebP at `assets/library/scenes/<id>.webp`, catalog `kind: "scene"`. Wide establishing shots with no characters in the foreground, so they work behind any party. These are the Western Marches frontier: a timber-and-stone frontier town called **Thornwatch**, wild lands around it, old ruins.

| id | Scene | Tags |
|---|---|---|
| scene-thornwatch-gate-day | Thornwatch's palisade gate, morning | town, gate, day, clear, outdoor, calm |
| scene-thornwatch-square | Muddy town square with market stalls | town, market, day, outdoor, festive |
| scene-tavern-night | The Lantern tavern, busy evening | tavern, town, night, indoor, festive |
| scene-tavern-quiet | The Lantern tavern, empty and dim | tavern, town, night, indoor, calm |
| scene-temple | Small frontier temple interior | temple, town, day, indoor, calm |
| scene-smithy | Blacksmith's forge | smithy, town, day, indoor, calm |
| scene-forest-road-day | Forest road through tall pines | road, forest, day, outdoor, calm |
| scene-forest-night | Deep forest at night, moonlight | forest, night, fog, outdoor, eerie |
| scene-river-crossing | Old stone bridge over a river | river, road, dusk, outdoor, calm |
| scene-farmstead | Abandoned farmstead, broken fences | farm, day, rain, outdoor, somber |
| scene-goblin-camp | Goblin camp in a ravine | camp, hills, dusk, outdoor, hostile |
| scene-abbey-exterior | Ruined abbey on a hill | abbey, ruins, hills, dusk, outdoor, eerie |
| scene-cave-entrance | Cave mouth in a rocky hillside | cave, hills, day, outdoor, tense |
| scene-cave-depths | Deep cave with a still pool | cave, underground, eerie |
| scene-crypt | Burial vaults with stone coffins | crypt, underground, eerie |
| scene-watchtower | Lonely watchtower on the frontier | watchtower, hills, dusk, storm, outdoor, tense |

### 4. Battle tilesets and boards

Three new tilesets and one board for each. Tilesets: `assets/sprites/tiles-<id>.png`, 5 frames of 128x128 (floor x3, wall, difficult terrain), catalog `kind: "tileset"` with `tiles` set to the PNG path. Optional props sheet `assets/sprites/props-<id>.png` (2x2 grid of 128x128) for decorations.

Boards: `assets/boards/<id>.json` following the board format in the [Art library spec](#art-library-spec), catalog `kind: "board"` with `board` set to the JSON path and `tiles` set to the tileset id.

| Tileset id | Look | Board id | Board idea | Board tags |
|---|---|---|---|---|
| tiles-forest | Forest floor, tree trunks as walls, brambles as difficult terrain | board-forest-road | A road through woods with tree clusters for cover | forest, road, outdoor |
| tiles-cave | Cave floor, rock walls, loose scree as difficult terrain | board-cave | Winding cave chambers with a narrow choke point | cave, underground |
| tiles-crypt | Flagstones, carved walls, broken coffins as difficult terrain | board-crypt | Burial halls with pillars and alcoves | crypt, dungeon, underground |

The abbey board stays as it is (Claude will convert it to this format).

### Expansion backlog done means

- [ ] Every asset in sections 1 to 4 exists at the path given, at the size given, with a catalog entry using the listed tags
- [ ] Large monster sheets are 384x384 frames
- [ ] Preview image `docs/art/library-batch-1.png` shows every monster sheet, a grid of all portraits and scenes, and the three boards
- [ ] `npm test`, `npm run typecheck` and `npm run build` pass
- [ ] Branch `art/library-batch-1` is pushed to GitHub
- [ ] `docs/art/CODEX_NOTES_LIBRARY_1.md` written

## Art history: batch 1 notes

Branch: `art/library-batch-1` from current master. The owner approved policy fixes and the representative pilot in `CODEX_BRIEF_LIBRARY_1.md` rather than producing the entire original78-deliverable brief at once.

### Infrastructure

- Independent art/mechanics/integration readiness gates. Pending monster art may exist before its stat block; shipped encounters cannot select it by default.
- Exact identity, mandatory location/setting/time/species/creature constraints, optional extra required tags, preference ranking, then repetition avoidance. Unknown/unmatched tags yield no result rather than unrelated art.
- Rules-size/footprint/anchor metadata separate from drawing canvas. Runtime default1x1 capability excludes larger sprites; no Large creature mechanics were added.
- Board validation for connectivity using engine diagonal rules, distinct separated spawns, props bounds and optional2x2 spawn/routes. These are content checks, not combat-system changes.
- Tests cover art-before-mechanics, runtime gating, compatibility selection, repetition regressions, real sheet dimensions, disconnected maps, overlapping spawns and narrow Large routes.

### Production

Pilot assets and preview are being produced on this branch. New entries remain integration-pending until Claude connects them and performs actual gameplay review. Mechanics remain pending for all five new monsters. Further production/validation details will be appended before final delivery.

### Completed pilot

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

### Quality and scope limitations

- Right-facing art is mirrored for left-facing; no north/south sheets.
- Each creature has one attack sequence and compact walking poses. This is the baseline library, not final weapon-by-weapon choreography.
- Spider far-side legs overlap in some poses. Ogre club is occluded in two walking poses, and slam/recovery could be more distinct. These remain motion-polish follow-ups before promoting gameplay integration.
- The forest scene uses WebPquality65 to meet the400KB cap; the tavern and portraits use85. Tavern conveys a prepared evening venue without foreground patrons.
- Forest tiles are reviewed for tactical clarity; their edge patterns are not mathematically seamless.
- The forest board declares optional2x2 geometry and alternate Large spawn slots. This is not an implementation of Large occupancy, reach, targeting or tactics. Mixed-size spawn allocation still belongs in the rules/runtime integration.
- Catalog selection is a tested library function. DM art-tool wiring, stable NPC image IDs in saves and runtime loading of these assets remain Claude's integration tasks.
- Layered/custom player-character art is still a separate project; this pilot leaves the four generic hero sheets unchanged.

### Next steps for Claude

Implement and test the five exact SRD creature stat blocks and their abilities; add grid/renderer support before enabling Large creatures. Map art to actual actions rather than playing a bite animation for every ability. Load the catalog's tileset/board paths, preserve selected art IDs in adventures, and use the new strict matching API. Perform real playthroughs, then promote mechanicsStatus/integrationStatus per asset with evidence. Do not mark the whole batch ready based on export success.

The original18-monster/78-deliverable brief remains expansion backlog. This representative pilot completes the smaller scope authorized by the owner.

### Validation evidence

- `npm install` succeeded (writable npm cache).
- All125tests, TypeScript and production build passed; the existing Phaser bundle-size advisory remains.
- Rebuilt all pilot exports and validated55frames and image budgets.
- Chromium asset-review checks passed at desktop1440x1000 and mobile390x844:16images, all5sprites, attack/walk/down playback, mirrored facing, pause/step, board rendering, no page errors and no mobile document overflow.
- Forest atlas was revised once after board-scale review found insufficient wall/difficult-terrain contrast. Original attempt is preserved; final tile separates open earth, central tree/canopy obstacle and pale tangled branches.
- Browser evidence covers the standalone asset viewer, not combat encounters. All17new entries retain integrationStatus pending and all5new monsters mechanicsStatus pending.

To repeat browser evidence, serve the repository root on port4173 and run `packages/web/art/codex/library1/browser-review.cjs` with Playwright available in Node's module path. `ART_REVIEW_URL` overrides the viewer URL and `CHROMIUM_PATH` can select a system Chromium. Playwright is a review-tool dependency, not a game runtime dependency.

### Pilot measurements

Agents recorded17image-generation calls:5monster atlases,5monster portraits,3NPC portraits,2scenes and2forest-atlas attempts. The first forest atlas was replaced after board-scale review. This measures candidate-art production only; paid API cost and end-to-end encounter-ready hours were not logged. Do not project a full-bestiary release date from these candidate generation times. Mechanics/in-game animation review remains the substantial unmeasured part.

## Art history: batch 1 review

Final result: passed for the asset-review viewer and static export contract; gameplay integration remains pending.

Reference: existing Codex art trial, original generated pilot source atlases and the approved library specification. Reviewed the exported contact sheet and actual Chromium page capture. The viewer is a review tool, not a recreation of a painted gameplay mockup.

Verified in Chromium at1440x1000 and390x844:
- All16 image resources load with no JavaScript errors or missing assets.
- All five monster canvases show actual image pixels at a common source-pixel scale.
- Attack strike frame7, walk frames2-5 and down frame10 render for all five creatures.
- Mirroring, animation selection, pause and manual stepping work.
- Forest board JSON loads and renders its terrain/spawn overlay.
- Mobile document has no horizontal overflow; the board itself scrolls in its own container.

Static validation checks55nonempty transparent frames with clear frame-edge margins,192/384px canvas dimensions and portrait/scene dimensions and budgets. Unit tests validate catalog gating, strict matching, references and board geometry.

Nonblocking polish: limited facing directions, compact gait cycles, spider leg overlap, ogre club occlusion and similar slam/recovery poses. Gameplay integration cannot be promoted until attacks/abilities, Large footprints and actual battle playback are tested by Claude.

