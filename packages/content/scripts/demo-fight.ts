/**
 * Watch a fight in the terminal: npm run demo [seed] [goblins]
 */
import { Combat, EventLog, mathRng, runCombat, seededRng, type LoggedEvent } from "@oathkeepers/engine";
import { buildCharacter, buildMonster, loadContent } from "../src/index.js";

const seedArg = process.argv[2];
const goblins = Number(process.argv[3] ?? 2);
const content = loadContent();
const bram = buildCharacter(content, content.characters[0]!);
const enemies = Array.from({ length: goblins }, (_, i) =>
  buildMonster(content.monsters[0]!, `goblin-${i + 1}`, `Goblin ${i + 1}`),
);
const combat = new Combat([bram, ...enemies], seedArg ? seededRng(Number(seedArg)) : mathRng, new EventLog());
const name = (id: string) => combat.get(id).name;

function describe(e: LoggedEvent): string | null {
  switch (e.type) {
    case "initiative":
      return `${name(e.creatureId)} rolls initiative: ${e.roll.total}${e.roll.mode === "advantage" ? ` (advantage: ${e.roll.faces.join(", ")})` : ""}`;
    case "round_start":
      return `\n=== Round ${e.round} ===`;
    case "turn_start":
      return `-- ${name(e.creatureId)}'s turn`;
    case "attack": {
      const dice = e.roll.faces.length > 1 ? ` [${e.roll.mode}: ${e.roll.faces.join(", ")}]` : "";
      const result = e.critical ? "CRITICAL HIT!" : e.hit ? "hit" : "miss";
      return `   ${name(e.attackerId)} attacks ${name(e.targetId)}: ${e.roll.natural}+${e.roll.modifier} = ${e.roll.total} vs AC ${e.targetAc}${dice} -> ${result}`;
    }
    case "damage":
      return `   ${name(e.targetId)} takes ${e.amount} ${e.damageType} damage (HP ${e.hpAfter})`;
    case "heal":
      return `   ${name(e.targetId)} heals ${e.amount} (HP ${e.hpAfter})`;
    case "feature_used":
      return `   ${name(e.creatureId)} uses ${e.featureId}`;
    case "effect_applied":
      return `   ${name(e.targetId)} is ${e.effectId}`;
    case "down":
      return `   ${name(e.creatureId)} falls unconscious!`;
    case "death_save":
      return `   ${name(e.creatureId)} death save: ${e.roll.natural} (${e.successes} successes, ${e.failures} failures)`;
    case "stabilized":
      return `   ${name(e.creatureId)} is stable`;
    case "death":
      return `   ${name(e.creatureId)} dies`;
    case "combat_end":
      return `\n${e.winner === "party" ? "Victory" : "Defeat"} after ${e.rounds} rounds.`;
    default:
      return null;
  }
}

runCombat(combat);
console.log(`${bram.name}, level 3 Champion Fighter (AC ${bram.ac}, HP ${bram.maxHp}) vs ${goblins} Goblin Warrior(s)\n`);
for (const e of combat.log.events) {
  const line = describe(e);
  if (line) console.log(line);
}
console.log(`(${combat.log.events.length} events logged)`);
