# Oathkeepers (working title)

A browser D&D 5e (2024 rules) game with an AI Dungeon Master and tactical grid combat. Solo or online with up to 6 friends.

- Design: [`docs/design.md`](docs/design.md)
- Tech plan: [`docs/tech-plan.md`](docs/tech-plan.md)

## Status

- Phase 1 (rules engine): done. Fighter vs Goblin combat runs end to end in tests.
- Phase 2 (character builder): done. Build a level 3 character of any SRD class in the browser.

## Getting started

Requires Node.js 22+.

```sh
npm install
npm test            # run all tests
npm run typecheck   # TypeScript checks
npm run dev         # browser app at http://localhost:5173
npm run build       # production build (what Netlify runs)
npm run demo        # watch a random fight in the terminal
npm run demo -- 7 3 # seed 7, three goblins
```

## Deploy (Netlify)

`netlify.toml` is set up: build command `npm run build`, publish folder `packages/web/dist`, Node 22.

## Layout

```
packages/
  engine/   Rules: dice, checks, damage, death saves, combat, tactics
  content/  Game data (classes, monsters, items, characters) + schemas and builders
  web/      Browser client (React): character builder and test fight
docs/       Design and tech plan
```

## Legal

This work includes material from the System Reference Document 5.2 ("SRD 5.2") by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.
