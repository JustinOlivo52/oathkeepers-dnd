import { describe, expect, it } from "vitest";
import { Combat, EventLog, RulesError, runCombat, scriptedRng, seededRng } from "../src/index.js";
import { makeCreature } from "./helpers.js";

function duel(faces: number[]) {
  const hero = makeCreature({
    id: "hero",
    abilities: { str: 10, dex: 14, con: 10, int: 10, wis: 10, cha: 10 },
    attacks: [{ id: "sword", name: "Sword", kind: "melee", attackBonus: 5, damage: "1d8+3", damageType: "slashing", mastery: "sap" }],
    features: ["weapon-mastery"],
    maxHp: 20,
    hp: 20,
  });
  const orc = makeCreature({ id: "orc", side: "enemies", kind: "monster", ac: 13, maxHp: 15, hp: 15 });
  // scriptedRng maps faces as d20 faces; damage dice use the same stream.
  const combat = new Combat([hero, orc], scriptedRng(faces), new EventLog());
  return { combat, hero, orc };
}

describe("Combat", () => {
  it("orders by initiative, ties broken by Dexterity", () => {
    const { combat } = duel([10, 10]);
    combat.start();
    expect(combat.order).toEqual(["hero", "orc"]);
    expect(combat.current.id).toBe("hero");
    expect(combat.round).toBe(1);
  });

  it("enforces turns and the action economy", () => {
    const { combat } = duel([15, 5, 2]);
    combat.start();
    expect(() => combat.attack("orc", "hero", "club")).toThrow(RulesError);
    combat.attack("hero", "orc", "sword");
    expect(() => combat.attack("hero", "orc", "sword")).toThrow(/no action left/);
    expect(() => combat.attack("hero", "hero", "sword")).toThrow(RulesError);
  });

  it("hits on total >= AC, always on a natural 20, never on a natural 1", () => {
    const { combat, orc } = duel([15, 5, 8, 1]);
    combat.start();
    expect(combat.attack("hero", "orc", "sword")).toEqual({ hit: true, critical: false });
    expect(orc.hp).toBeLessThan(15);

    const miss = duel([15, 5, 1]);
    miss.combat.start();
    expect(miss.combat.attack("hero", "orc", "sword").hit).toBe(false);

    const crit = duel([15, 5, 20, 1, 1]);
    crit.combat.start();
    expect(crit.combat.attack("hero", "orc", "sword")).toEqual({ hit: true, critical: true });
  });

  it("applies Sap: disadvantage on the target's next attack", () => {
    // init hero 15, orc 5; hero hits (10+5) and deals 1+3; orc attacks with two dice (18, 3) and uses the 3
    const { combat, hero, orc } = duel([15, 5, 10, 1, 18, 3]);
    combat.start();
    combat.attack("hero", "orc", "sword");
    expect(orc.effects.map((e) => e.id)).toEqual(["sapped"]);
    combat.endTurn();
    expect(combat.attack("orc", "hero", "club").hit).toBe(false);
    expect(orc.effects).toEqual([]);
    expect(hero.hp).toBe(20);
    const attack = combat.log.ofType("attack").at(-1)!;
    expect(attack.roll).toMatchObject({ mode: "disadvantage", natural: 3 });
  });

  it("runs a full fight to the end and logs every roll", () => {
    const { combat } = duel([]);
    const seeded = new Combat([...combat.creatures.values()], seededRng(1), new EventLog());
    runCombat(seeded);
    expect(seeded.isOver).toBe(true);
    expect(seeded.log.ofType("combat_end")).toHaveLength(1);
    expect(seeded.log.ofType("attack").length).toBeGreaterThan(0);
  });
});
