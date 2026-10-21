# Game Design Doc (working title: Oathkeepers)

Status: planning phase. Nothing here is built yet.

## 1. Vision

A browser game that plays like a real D&D 5e campaign. An AI Dungeon Master runs the story, NPCs and world. Combat happens on a pixel-art tactical grid. Play solo or online with up to 6 friends.

## 2. Core decisions (locked)

### Players and sessions
| Decision | Choice |
|---|---|
| Modes | Single player (true solo or with AI companions) and live online multiplayer |
| Party size | Up to 6 players |
| Session style | Drop in, drop out |
| Campaign | One continuous campaign |
| Absent player | Their character sits out and earns a reduced XP share |
| Joining | Only at natural breaks (scene change, rest, town). Never mid-combat |
| Voice | Speech-to-text for players, text-to-speech for the DM |

### Dungeon Master
| Decision | Choice |
|---|---|
| Who DMs | AI only for now. Human DM mode is a future feature, so design for it |
| Style | Mix of by-the-book and rule of cool |
| Player freedom | True D&D: players can attempt anything |
| Content | Like a regular D&D campaign. It gets dark when the story calls for it |

### Rules
| Decision | Choice |
|---|---|
| Edition | 5e 2024 rules (SRD 5.2, CC-BY-4.0) |
| Optional rules | None for now |
| Death | Standard death saving throws |
| Dice | Players click to roll their own |
| Homebrew | Original subclasses inspired by classic 5e subclass concepts, with our own names and features (see section 6) |

### Characters
| Decision | Choice |
|---|---|
| Creation | Full builder (species, class, background, ability scores) |
| Starting level | 3 |
| Leveling | XP |

### World and story
| Decision | Choice |
|---|---|
| Setting | The Western Marches (see section 7) |
| Structure | Mix: written key story beats, AI improvises in between |
| Tone | High adventure |
| First adventure | Decide later |

### Look and feel
| Decision | Choice |
|---|---|
| Art | Pixel art first, possibly hand drawn later |
| Maps | Procedurally generated |
| Audio | Music and sound effects |
| Title | Not final |

### Practical
| Decision | Choice |
|---|---|
| AI provider | Any capable hosted model to start (Claude, GPT, etc.), local open-source models as backup (see section 5) |
| Hosting | Free tier to start |
| Platform | Browser first, desktop and mobile later |

## 3. How the game plays

### Exploration and social (outside combat)
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

### Combat
- Switches to a tactical grid map
- Initiative, full 5e action economy (action, bonus action, reaction, movement)
- Monsters use rule-based tactics, not the LLM
- Returns to narration when combat ends

## 4. Key architecture rule

The AI tells the story. The code enforces the rules.

The DM never does dice math or tracks HP. It calls engine functions such as `request_check`, `start_combat`, `grant_xp` or `give_item`, and the rules engine resolves them. All game state lives in the engine, not in the AI's memory.

## 5. AI provider

Build a provider layer so the DM model can be swapped without changing the game.

- Start: whichever hosted model (Claude, GPT, etc.) handles the DM role best. Pick by testing real sessions, mainly on storytelling and calling game functions correctly.
- Backup: open-source models run locally. Explore later, including GPU requirements.

| | Hosted model | Local model |
|---|---|---|
| Cost | Pay per use | Free after hardware |
| DM quality | Strong storytelling and tool use | Usually weaker, varies by model |
| Hardware | None | Needs a strong GPU on the host machine |
| Online play | Works from any server | Host must run the model |

## 6. Party, progression and homebrew

### Solo play and companions
- True solo: one player, no companions. Encounters scale to party size and level (5e's encounter budget is per character).
- Companions: solo players and small groups can recruit AI-controlled companions. They step aside when real players join. Treat as a test feature first.

### Absent players
- Absent characters earn a reduced XP share so the party stays close in level.
- Exact share to be tuned in playtesting.

### Joining
- Players join only at natural breaks: scene change, rest, town. Never mid-combat.

### Homebrew subclasses
- SRD 5.2 gives one subclass per class. We add original subclasses to fill out each class.
- Inspired by classic subclass concepts, but with our own names, flavor and features.
- Guardrails: never copy official text, names or feature wording. Write our own features and tweak the mechanics, rather than renaming an existing subclass one to one.

## 7. Setting: The Western Marches

- A frontier kingdom at the edge of a wild, unexplored land full of ruins, dungeons and the remains of old empires.
- Players start from a home-base town, head out on expeditions and come back to rest, trade and plan.
- Built for rotating players: each expedition is a self-contained trip, which fits drop in, drop out.
- Long-running mysteries and story beats tie expeditions into one continuous campaign.
- Tone: high adventure, dark when the story calls for it.

### Open questions
- Title
- First adventure
- Home-base town, frontier regions and main threat
- Companion design (who they are, how they're recruited)

## 8. Build phases

1. Rules engine: dice, character sheets, checks, attacks, damage, conditions. Tested logic, no visuals.
2. Character builder: full 2024 creation flow.
3. Grid combat: generated map, monsters, turn-based fights.
4. AI DM: narration, NPCs, checks, handoff to and from combat.
5. Single player campaign loop with companions, saves, rests, leveling.
6. Multiplayer: rooms, drop in, drop out, sync.
7. Voice, music and effects.
8. Content waves: all SRD classes, spells, monsters, items.
9. Campaign: setting, story beats, first adventure.

## 9. Legal

Uses the System Reference Document 5.2 by Wizards of the Coast, licensed under CC-BY-4.0. Attribution required in the game. No non-SRD content (no Forgotten Realms, Beholders, Mind Flayers, or "D&D" in the title).
