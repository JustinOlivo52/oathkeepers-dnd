# Game Design Doc (working title: Oathkeepers)

Status: planning phase. Nothing here is built yet.

## 1. Vision

A browser game that plays like a real D&D 5e campaign. An AI Dungeon Master runs the story, NPCs and world. Combat happens on a pixel-art tactical grid. Play solo or online with up to 6 friends.

## 2. Core decisions (locked)

### Players and sessions
| Decision | Choice |
|---|---|
| Modes | Single player and live online multiplayer |
| Party size | Up to 6 players |
| Session style | Drop in, drop out |
| Campaign | One continuous campaign |
| Absent player | Their character sits out |
| Voice | Speech-to-text for players, text-to-speech for the DM |

### Dungeon Master
| Decision | Choice |
|---|---|
| Who DMs | AI only for now. Human DM mode is a future feature, so design for it |
| Style | Mix of by-the-book and rule of cool |
| Player freedom | True D&D: players can attempt anything |
| Content | Mature. Can go as dark as a real campaign |

### Rules
| Decision | Choice |
|---|---|
| Edition | 5e 2024 rules (SRD 5.2, CC-BY-4.0) |
| Optional rules | None for now |
| Death | Standard death saving throws |
| Dice | Players click to roll their own |
| Homebrew | None |

### Characters
| Decision | Choice |
|---|---|
| Creation | Full builder (species, class, background, ability scores) |
| Starting level | 3 |
| Leveling | XP |

### World and story
| Decision | Choice |
|---|---|
| Setting | Original, classic D&D feel (TBD, see open questions) |
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
| AI provider | Claude API, with local AI as an option (see section 5) |
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

## 5. AI provider: Claude vs local

Build an AI provider layer so the DM model can be swapped.

| | Claude API | Local model |
|---|---|---|
| Cost | Pay per use | Free after hardware |
| DM quality | Strong storytelling and tool use | Noticeably weaker, varies by model |
| Hardware | None | Needs a strong GPU on the host machine |
| Content limits | Handles dark fantasy, has usage policy limits | Fewer limits |
| Online play | Works from any server | Host must run the model |

Plan: build on Claude first, add local as an option once the game works.

## 6. Recommended defaults (pending confirmation)

- AI companions: 5e is balanced for about 4 characters. Solo players and small groups can recruit AI-controlled companions to fill the party. Companions leave or step back when real players join.
- Absent players and XP: absent characters fall behind on XP. Option: absent characters earn a reduced share, or the party levels together.
- Drop-in timing: new or returning players join at a natural break (scene change, rest, town), not mid-combat.
- Subclasses: SRD 5.2 includes all 12 classes but one subclass each. With no homebrew, each class has one subclass option.
- Voice: start with the browser's built-in speech tools (free), upgrade to a paid voice service if quality is not good enough.

## 7. Open questions

- Setting (see options in chat)
- Title
- First adventure
- Confirm the recommended defaults in section 6

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
