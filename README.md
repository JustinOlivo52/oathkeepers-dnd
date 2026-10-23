# Oathkeepers (working title)

A browser D&D 5e (2024 rules) game with an AI Dungeon Master and tactical grid combat. Solo or online with up to 6 friends.

- Design: [`docs/design.md`](docs/design.md)
- Tech plan: [`docs/tech-plan.md`](docs/tech-plan.md)

## Status

- Phase 1 (rules engine): done. Fighter vs Goblin combat runs end to end in tests.
- Phase 2 (character builder): done. Build a level 3 character of any SRD class in the browser.
- Phase 3 (grid combat): done. Turn-based battles on generated dungeon maps with pixel art.
- Phase 4 (AI Dungeon Master): part 1 done. Story mode with an AI DM (Claude) or a free demo DM.

## Getting started

Requires Node.js 22+.

```sh
npm install
cp .env.example .env   # then add your ANTHROPIC_API_KEY (optional: leave empty for the demo DM)
npm run check-setup    # checks Node, .env and your API key (one tiny real request)
npm run dev            # game server + web app: open http://localhost:5173
npm run eval:dm        # DM quality tests against Claude (needs your key, about $0.10 to $0.30)
npm test            # run all tests
npm run typecheck   # TypeScript checks
npm run build       # production build of the web app
npm start           # production server: serves the build and the API on one port
npm run demo        # watch a random fight in the terminal
npm run demo -- 7 3 # seed 7, three goblins
npm run balance -- 3 # win rate vs 3 goblins on generated maps
npm run sprites -w @oathkeepers/web  # rebuild sprite sheets (needs Python 3 + Pillow)
```

## Deploy

The full game (AI DM, accounts, shared tables) runs as one Docker container: see [docs/deploy.md](docs/deploy.md).
`netlify.toml` still works for a static, offline-demo-only copy (no AI DM, no multiplayer).

## Layout

```
packages/
  engine/   Rules: dice, checks, damage, death saves, combat, tactics
  content/  Game data (classes, monsters, items, characters) + schemas and builders
  dm/       AI Dungeon Master: provider layer, Director, tools, demo DM
  server/   Game server: keeps API keys, runs the DM, saves adventures
  web/      Browser client (React + Phaser): adventure, character builder, battles
docs/       Design and tech plan
```

## Legal

This work includes material from the System Reference Document 5.2 ("SRD 5.2") by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.
