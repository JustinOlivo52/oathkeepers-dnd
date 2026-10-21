/** Balance check: auto-play Bram vs goblins on generated maps and report outcomes. npx tsx packages/content/scripts/grid-stats.ts [goblins] */
import { Combat, EventLog, generateDungeon, runCombat, seededRng } from "@oathkeepers/engine";
import { buildCharacter, buildMonster, loadContent } from "../src/index.js";

const content = loadContent();
const goblins = Number(process.argv[2] ?? 3);
let wins = 0, hpLost = 0, goblinAttacks = 0, goblinHits = 0, ranged = 0, rounds = 0, oas = 0;
const N = 300;
for (let seed = 1; seed <= N; seed++) {
  const gen = generateDungeon(seededRng(seed));
  const bram = buildCharacter(content, content.characters[0]!);
  bram.position = gen.partySpawns[0];
  const enemies = Array.from({ length: goblins }, (_, i) => {
    const g = buildMonster(content.monsters[0]!, `g${i}`);
    g.position = gen.enemySpawns[i];
    return g;
  });
  const combat = new Combat([bram, ...enemies], seededRng(seed * 31), new EventLog(), gen.map);
  runCombat(combat);
  if (combat.winner === "party") wins++;
  hpLost += bram.maxHp - bram.hp;
  rounds += combat.round;
  for (const a of combat.log.ofType("attack")) {
    if (a.attackerId === bram.id) continue;
    goblinAttacks++;
    if (a.hit) goblinHits++;
    if (a.attackId === "shortbow") ranged++;
  }
  oas += combat.log.ofType("reaction").length;
}
console.log({ goblins, winRate: wins / N, avgHpLost: hpLost / N, avgRounds: rounds / N, goblinHitRate: goblinHits / goblinAttacks, shortbowShare: ranged / goblinAttacks, oasPerFight: oas / N });
