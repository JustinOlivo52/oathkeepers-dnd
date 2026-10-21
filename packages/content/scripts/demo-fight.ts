/**
 * Watch a fight in the terminal: npm run demo [seed] [goblins]
 */
import { Combat, EventLog, mathRng, runCombat, seededRng } from "@oathkeepers/engine";
import { buildCharacter, buildMonster, describeEvent, loadContent } from "../src/index.js";

const seedArg = process.argv[2];
const goblins = Number(process.argv[3] ?? 2);
const content = loadContent();
const bram = buildCharacter(content, content.characters[0]!);
const enemies = Array.from({ length: goblins }, (_, i) =>
  buildMonster(content.monsters[0]!, `goblin-${i + 1}`, `Goblin ${i + 1}`),
);
const combat = new Combat([bram, ...enemies], seedArg ? seededRng(Number(seedArg)) : mathRng, new EventLog());

runCombat(combat);
console.log(`${bram.name}, level 3 Champion Fighter (AC ${bram.ac}, HP ${bram.maxHp}) vs ${goblins} Goblin Warrior(s)\n`);
for (const e of combat.log.events) {
  const line = describeEvent(e, (id) => combat.get(id).name);
  if (!line) continue;
  const indent = e.type === "round_start" || e.type === "turn_start" || e.type === "combat_end" ? "" : "   ";
  console.log((e.type === "round_start" || e.type === "combat_end" ? "\n" : "") + indent + line);
}
console.log(`(${combat.log.events.length} events logged)`);
