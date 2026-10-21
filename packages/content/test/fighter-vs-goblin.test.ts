import { describe, expect, it } from "vitest";
import { Combat, EventLog, runCombat, seededRng, type LoggedEvent, type Rng } from "@oathkeepers/engine";
import { buildCharacter, buildMonster, loadContent } from "../src/index.js";

/**
 * Phase 1 milestone: a Fighter vs Goblin fight runs start to finish,
 * following 5e rules, with every roll logged.
 */
const content = loadContent();
const bramData = content.characters.find((c) => c.id === "bram-holloway")!;
const goblinData = content.monsters.find((m) => m.id === "goblin-warrior")!;

function countingRng(seed: number): Rng & { calls: number } {
  const inner = seededRng(seed);
  const rng = { calls: 0, next: () => (rng.calls++, inner.next()) };
  return rng;
}

/** Number of dice faces recorded in the log. Should equal the number of dice actually rolled. */
function loggedFaces(events: LoggedEvent[]): number {
  let faces = 0;
  for (const e of events) {
    if ("roll" in e && e.roll) {
      faces += "faces" in e.roll ? e.roll.faces.length : e.roll.results.reduce((n, r) => n + r.faces.length, 0);
    }
  }
  return faces;
}

function fight(seed: number, goblins = 1) {
  const rng = countingRng(seed);
  const bram = buildCharacter(content, bramData);
  const enemies = Array.from({ length: goblins }, (_, i) => buildMonster(goblinData, `goblin-${i + 1}`, `Goblin ${i + 1}`));
  const combat = new Combat([bram, ...enemies], rng, new EventLog());
  runCombat(combat);
  return { combat, rng, bram, enemies };
}

describe("Phase 1 milestone: Fighter vs Goblin", () => {
  it("runs to completion with a winner", () => {
    const { combat } = fight(1);
    expect(combat.isOver).toBe(true);
    expect(combat.winner).toMatch(/party|enemies/);
    expect(combat.log.events.at(-1)).toMatchObject({ type: "combat_end" });
  });

  it("logs every single die that was rolled", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const { combat, rng } = fight(seed, 3);
      expect(loggedFaces(combat.log.events), `seed ${seed}`).toBe(rng.calls);
    }
  });

  it("is repeatable: the same seed gives the same fight", () => {
    expect(fight(99).combat.log.events).toEqual(fight(99).combat.log.events);
  });

  it("follows the rules on every attack", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const { combat } = fight(seed, 2);
      for (const a of combat.log.ofType("attack")) {
        const shouldHit = a.roll.natural === 20 || (a.roll.natural !== 1 && a.roll.total >= a.targetAc);
        expect(a.hit).toBe(shouldHit);
        if (a.critical) expect(a.hit).toBe(true);
        if (a.attackerId === "bram-holloway" && a.roll.natural >= 19) expect(a.critical).toBe(true);
      }
      for (const e of combat.log.ofType("initiative")) {
        if (e.creatureId === "bram-holloway") expect(e.roll.mode).toBe("advantage");
      }
    }
  });

  it("uses Action Surge and Second Wind within their limits", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const { combat } = fight(seed, 3);
      const used = combat.log.ofType("feature_used");
      expect(used.filter((e) => e.featureId === "action-surge").length).toBeLessThanOrEqual(1);
      expect(used.filter((e) => e.featureId === "second-wind").length).toBeLessThanOrEqual(2);
    }
  });

  it("a level 3 Fighter usually beats one goblin", () => {
    let wins = 0;
    for (let seed = 1; seed <= 200; seed++) if (fight(seed).combat.winner === "party") wins++;
    expect(wins / 200).toBeGreaterThan(0.95);
  });

  it("handles a downed fighter making death saves", () => {
    let sawDeathSave = false;
    for (let seed = 1; seed <= 300 && !sawDeathSave; seed++) {
      const { combat } = fight(seed, 6);
      sawDeathSave = combat.log.ofType("down").length > 0;
      if (sawDeathSave) expect(combat.winner).toBe("enemies");
    }
    expect(sawDeathSave).toBe(true);
  });
});
