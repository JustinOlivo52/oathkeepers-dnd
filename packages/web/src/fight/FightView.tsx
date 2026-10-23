import { useEffect, useState } from "react";
import { Combat, EventLog, mathRng, runCombat, seededRng, type LoggedEvent } from "@oathkeepers/engine";
import { buildCharacter, buildMonster, describeEvent, type CharacterData } from "@oathkeepers/content";
import { content } from "../content";

interface Result {
  summary: string;
  lines: { text: string; className: string }[];
}

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

function runFight(character: CharacterData, goblins: number, seed: string): Result {
  const hero = buildCharacter(content, character);
  const enemies = Array.from({ length: goblins }, (_, i) =>
    buildMonster(content.monsters[0]!, `goblin-${i + 1}`, `Goblin ${i + 1}`),
  );
  const combat = new Combat([hero, ...enemies], seed ? seededRng(Number(seed)) : mathRng, new EventLog());
  runCombat(combat);
  const lines = combat.log.events.flatMap((e) => {
    const text = describeEvent(e, (id) => combat.get(id).name);
    return text ? [{ text, className: classFor(e) }] : [];
  });
  return {
    summary:
      `${hero.name} (AC ${hero.ac}, HP ${hero.maxHp}) vs ${goblins} Goblin Warrior${goblins > 1 ? "s" : ""}: ` +
      `${combat.winner === "party" ? "Victory" : "Defeat"} in ${combat.round} rounds, ${combat.log.events.length} events logged.`,
    lines,
  };
}

export function FightView(props: { characters: CharacterData[]; selectedId: string; onSelect: (id: string) => void }) {
  const [goblins, setGoblins] = useState(2);
  const [seed, setSeed] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const character = props.characters.find((c) => c.id === props.selectedId) ?? props.characters[0]!;

  const fight = () => setResult(runFight(character, goblins, seed));
  useEffect(fight, [props.selectedId]);

  return (
    <main className="fight">
      <p className="hint">Rules engine auto-battle. Both sides use simple tactics.</p>
      <section className="controls">
        <label>
          Character
          <select value={character.id} onChange={(e) => props.onSelect(e.target.value)}>
            {props.characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Goblins
          <select value={goblins} onChange={(e) => setGoblins(Number(e.target.value))}>
            {[1, 2, 3, 4, 6].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <label>
          Seed (optional)
          <input type="number" placeholder="random" value={seed} onChange={(e) => setSeed(e.target.value)} />
        </label>
        <button className="primary" onClick={fight}>
          Run fight
        </button>
      </section>
      {result && (
        <>
          <p className="summary">{result.summary}</p>
          <ol className="log">
            {result.lines.map((l, i) => (
              <li key={i} className={l.className}>
                {l.text}
              </li>
            ))}
          </ol>
        </>
      )}
    </main>
  );
}
