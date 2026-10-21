import { Combat, EventLog, mathRng, runCombat, seededRng, type LoggedEvent } from "@oathkeepers/engine";
import { buildCharacter, buildMonster, describeEvent, loadContent } from "@oathkeepers/content";

const content = loadContent();
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function classFor(e: LoggedEvent): string {
  switch (e.type) {
    case "round_start":
      return "round";
    case "turn_start":
      return "turn";
    case "attack":
      return e.critical ? "crit" : e.hit ? "hit" : "miss";
    case "damage":
    case "down":
    case "death":
      return "bad";
    case "heal":
    case "stabilized":
      return "good";
    case "combat_end":
      return e.winner === "party" ? "victory" : "defeat";
    default:
      return "";
  }
}

function runFight(): void {
  const goblins = Number($<HTMLSelectElement>("goblins").value);
  const seedText = $<HTMLInputElement>("seed").value.trim();
  const bram = buildCharacter(content, content.characters[0]!);
  const enemies = Array.from({ length: goblins }, (_, i) =>
    buildMonster(content.monsters[0]!, `goblin-${i + 1}`, `Goblin ${i + 1}`),
  );
  const combat = new Combat([bram, ...enemies], seedText ? seededRng(Number(seedText)) : mathRng, new EventLog());
  runCombat(combat);

  const summary = $("summary");
  summary.hidden = false;
  summary.textContent =
    `${bram.name}, level 3 Champion Fighter (AC ${bram.ac}, HP ${bram.maxHp}) vs ${goblins} Goblin Warrior${goblins > 1 ? "s" : ""}. ` +
    `${combat.winner === "party" ? "Victory" : "Defeat"} in ${combat.round} rounds, ${combat.log.events.length} events logged.`;

  const log = $("log");
  log.replaceChildren();
  for (const e of combat.log.events) {
    const text = describeEvent(e, (id) => combat.get(id).name);
    if (!text) continue;
    const li = document.createElement("li");
    li.textContent = text;
    li.className = classFor(e);
    log.append(li);
  }
}

$("fight").addEventListener("click", runFight);
runFight();
