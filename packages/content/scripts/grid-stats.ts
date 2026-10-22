/** Balance check: auto-play one character vs monsters on generated maps. npm run balance -- [count] [monster-id] [character-id] */
import { Combat, EventLog, footprintSquares, generateDungeon, key, runCombat, seededRng } from "@oathkeepers/engine";
import { buildCharacter, buildMonster, loadContent } from "../src/index.js";

const content = loadContent();
const goblins = Number(process.argv[2] ?? 3);
const monsterId = process.argv[3] ?? "goblin-warrior";
const monster = content.monsters.find((m) => m.id === monsterId)!;
const hero = content.characters.find((c) => c.id === (process.argv[4] ?? "bram-holloway"))!;
const used: Record<string, number> = {};
let wins = 0, hpLost = 0, enemyAttacks = 0, enemyHits = 0, ranged = 0, rounds = 0, oas = 0;
const N = 300;
for (let seed = 1; seed <= N; seed++) {
  const gen = generateDungeon(seededRng(seed));
  const bram = buildCharacter(content, hero);
  bram.position = gen.partySpawns[0];
  const enemies = Array.from({ length: goblins }, (_, i) => {
    return buildMonster(monster, `g${i}`);
  });
  // Place enemies on spawn squares with room for their footprint.
  const taken = new Set([key(bram.position!)]);
  for (const e of enemies) {
    const size = e.footprint ?? 1;
    e.position = gen.enemySpawns.find((p) => footprintSquares(p, size).every((q) => gen.map.walkable(q) && !taken.has(key(q))));
    if (!e.position) throw new Error(`seed ${seed}: no room for ${e.name}`);
    for (const q of footprintSquares(e.position, size)) taken.add(key(q));
  }
  const combat = new Combat([bram, ...enemies], seededRng(seed * 31), new EventLog(), gen.map);
  runCombat(combat);
  if (combat.winner === "party") wins++;
  hpLost += bram.maxHp - bram.hp;
  rounds += combat.round;
  for (const a of combat.log.ofType("attack")) {
    if (a.attackerId === bram.id) continue;
    enemyAttacks++;
    if (a.hit) enemyHits++;
    if (monster.attacks.some((x) => x.id === a.attackId && x.kind === "ranged")) ranged++;
  }
  oas += combat.log.ofType("reaction").length;
  for (const e of combat.log.events) {
    if (e.type !== "feature_used" && e.type !== "extra_damage" && e.type !== "spell_cast") continue;
    const id = e.type === "feature_used" ? e.featureId : e.type === "spell_cast" ? `spell:${e.spellId}` : `+${e.source}`;
    if (e.creatureId === bram.id) used[id] = (used[id] ?? 0) + 1;
  }
}
console.log({ hero: hero.id, monster: monsterId, count: goblins, winRate: wins / N, avgHpLost: hpLost / N, avgRounds: rounds / N, enemyHitRate: enemyHits / enemyAttacks, rangedShare: ranged / enemyAttacks, oasPerFight: oas / N, perFight: Object.fromEntries(Object.entries(used).map(([k, v]) => [k, +(v / N).toFixed(2)])) });
