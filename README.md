# Oathkeepers (working title)

Browser D&D 5e (2024 rules) with an AI Dungeon Master and tactical grid combat. Play solo, with AI companions, or online with up to 6 friends.

Project doc (design, tech plan, deployment, art): [`docs/OATHKEEPERS.md`](docs/OATHKEEPERS.md)

## Getting started

Requires Node.js 22+.

```sh
npm install
cp .env.example .env   # set ANTHROPIC_API_KEY, or leave empty for the demo DM
npm run check-setup    # checks Node, .env and the API key
npm run dev            # server + web app on http://localhost:5173
```

Other scripts:

```sh
npm test             # all tests
npm run typecheck    # tsc
npm run build        # production build of the web app
npm start            # production server: web build + API on one port
npm run eval:dm      # DM prompt evals against the API (~$0.10-0.30)
npm run demo         # random fight in the terminal (npm run demo -- 7 3: seed 7, 3 goblins)
npm run balance -- 3 # win rate vs 3 goblins on generated maps
npm run sprites -w @oathkeepers/web  # rebuild sprite sheets (Python 3 + Pillow)
```

## Deploy

One Docker container runs everything (web build, API, DM, multiplayer). Render setup and env vars: [Deployment](docs/OATHKEEPERS.md#deployment).

`netlify.toml` still builds a static copy with the offline demo DM only.

## Layout

```
packages/
  engine/   Rules: dice, checks, damage, conditions, spells, combat, grid, tactics
  content/  Game data (classes, spells, monsters, items, characters), schemas, builders, level-up
  dm/       AI DM: provider layer, Director, tools, memory, demo DM
  server/   API, accounts, shared tables, server-run battles, saves
  web/      React + Phaser client: adventure, character builder, battles
docs/       Project doc and open art briefs
```

## Roadmap

Done:

- [x] Rules engine: checks, attacks, damage, conditions, death saves, concentration
- [x] Character builder: all 12 SRD classes, species, backgrounds, spells
- [x] Grid combat with pixel art, generated dungeons and hand-made boards
- [x] AI DM: story mode, skill checks, battles, NPCs, quests, session recaps, voice narration
- [x] AI companions (up to 3) that fight and level with you
- [x] Levels 1-5 for every class, with a level-up walkthrough
- [x] Player accounts (name + PIN) with saved characters and adventures
- [x] Multiplayer: invite codes, live tables, shared server-run battles, drop in/out at breaks
- [x] Deployable: Docker image, Postgres saves, group code for signups, Render config

Next:

- [ ] Deploy to Render and playtest with friends
- [ ] Tune the DM prompt from real playtests
- [ ] Art batch 2 (more monsters, NPCs, scenes, boards) and spell effects
- [ ] Stat blocks for the new monsters

Later:

- [ ] Real sign-in to replace name + PIN
- [ ] Levels 6+
- [ ] Original subclasses
- [ ] Starting equipment packages and gold

## Legal

This work includes material from the System Reference Document 5.2 ("SRD 5.2") by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.
